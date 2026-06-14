import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createReservation,
  calculatePriorityScore,
  computeQueuePositions,
  findActivatableReservations,
  createRequestFromReservation,
  activateReservation,
  validateActivation,
  cancelReservation,
  expireOutdatedReservations,
  recalcAllPriorities,
  getPriorityScoreBreakdown,
  analyzeConflicts,
  batchActivateReservations,
  skipReservation,
  CONFLICT_TYPES,
  RESERVATION_STATUSES
} from '../../utils/reservationTransform.js';
import {
  createMockGear,
  createMockRequest,
  createMockReservation,
  createMockHandover,
  createMockHealthInfo,
  iso
} from '../testData.js';

describe('reservationTransform - 优先级计算', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-14T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('紧急程度：借用日期已到或已过期，得50分', () => {
    const reservation = createMockReservation({
      start: iso(0),
      end: iso(2),
      borrower: '王五'
    });
    const score = calculatePriorityScore(reservation, {
      requests: [],
      handovers: [],
      healthInfoMap: {}
    });
    const breakdown = getPriorityScoreBreakdown(reservation, {
      requests: [],
      handovers: [],
      healthInfoMap: {}
    });
    const urgencyFactor = breakdown.breakdown.find(b => b.key === 'urgency');
    expect(urgencyFactor.score).toBe(50);
    expect(urgencyFactor.reason).toContain('已到或已过期');
  });

  it('紧急程度：3天内借用，得40分', () => {
    const reservation = createMockReservation({
      start: iso(2),
      end: iso(4),
      borrower: '王五'
    });
    const breakdown = getPriorityScoreBreakdown(reservation, {
      requests: [],
      handovers: [],
      healthInfoMap: {}
    });
    const urgencyFactor = breakdown.breakdown.find(b => b.key === 'urgency');
    expect(urgencyFactor.score).toBe(40);
  });

  it('借用历史：无活跃借用，得20分', () => {
    const reservation = createMockReservation({ borrower: '王五' });
    const breakdown = getPriorityScoreBreakdown(reservation, {
      requests: [],
      handovers: [],
      healthInfoMap: {}
    });
    const borrowFactor = breakdown.breakdown.find(b => b.key === 'borrowHistory');
    expect(borrowFactor.score).toBe(20);
    expect(borrowFactor.reason).toContain('信用良好');
  });

  it('借用历史：1个活跃借用，得10分', () => {
    const reservation = createMockReservation({ borrower: '王五' });
    const requests = [
      createMockRequest({ borrower: '王五', status: '借出中' })
    ];
    const breakdown = getPriorityScoreBreakdown(reservation, {
      requests,
      handovers: [],
      healthInfoMap: {}
    });
    const borrowFactor = breakdown.breakdown.find(b => b.key === 'borrowHistory');
    expect(borrowFactor.score).toBe(10);
  });

  it('借用历史：2个以上活跃借用，得0分', () => {
    const reservation = createMockReservation({ borrower: '王五' });
    const requests = [
      createMockRequest({ borrower: '王五', status: '借出中' }),
      createMockRequest({ borrower: '王五', status: '已同意', id: 'req-2' })
    ];
    const breakdown = getPriorityScoreBreakdown(reservation, {
      requests,
      handovers: [],
      healthInfoMap: {}
    });
    const borrowFactor = breakdown.breakdown.find(b => b.key === 'borrowHistory');
    expect(borrowFactor.score).toBe(0);
  });

  it('交接记录：3次完成交接，得15分（上限）', () => {
    const reservation = createMockReservation({ borrower: '王五' });
    const handovers = [
      createMockHandover({ borrower: '王五' }),
      createMockHandover({ borrower: '王五', id: 'hand-2' }),
      createMockHandover({ borrower: '王五', id: 'hand-3' }),
      createMockHandover({ borrower: '王五', id: 'hand-4' })
    ];
    const breakdown = getPriorityScoreBreakdown(reservation, {
      requests: [],
      handovers,
      healthInfoMap: {}
    });
    const handoverFactor = breakdown.breakdown.find(b => b.key === 'handoverHistory');
    expect(handoverFactor.score).toBe(15);
    expect(handoverFactor.details.completedCount).toBe(4);
  });

  it('健康分偏低：装备健康分<50，扣10分', () => {
    const reservation = createMockReservation({ gearId: 'gear-001', borrower: '王五' });
    const healthInfoMap = {
      'gear-001': createMockHealthInfo({ overallHealthScore: 45 })
    };
    const breakdown = getPriorityScoreBreakdown(reservation, {
      requests: [],
      handovers: [],
      healthInfoMap
    });
    const healthFactor = breakdown.breakdown.find(b => b.key === 'healthAdjustment');
    expect(healthFactor.score).toBe(-10);
    expect(healthFactor.reason).toContain('适当降低优先级');
  });

  it('综合评分：理想情况下最高分不超过100', () => {
    const reservation = createMockReservation({
      start: iso(0),
      borrower: '王五'
    });
    const handovers = [
      createMockHandover({ borrower: '王五' }),
      createMockHandover({ borrower: '王五', id: 'hand-2' }),
      createMockHandover({ borrower: '王五', id: 'hand-3' })
    ];
    const score = calculatePriorityScore(reservation, {
      requests: [],
      handovers,
      healthInfoMap: {}
    });
    expect(score).toBeLessThanOrEqual(100);
    expect(score).toBe(85);
  });

  it('综合评分：健康分低时可能降到最低', () => {
    const reservation = createMockReservation({
      start: iso(30),
      borrower: '王五'
    });
    const requests = [
      createMockRequest({ borrower: '王五', status: '借出中' }),
      createMockRequest({ borrower: '王五', status: '借出中', id: 'req-2' })
    ];
    const healthInfoMap = {
      'gear-001': createMockHealthInfo({ overallHealthScore: 30 })
    };
    const score = calculatePriorityScore(reservation, {
      requests,
      handovers: [],
      healthInfoMap
    });
    expect(score).toBeGreaterThanOrEqual(0);
  });
});

describe('reservationTransform - 队列排序', () => {
  it('按优先级分数降序分配队列位置', () => {
    const reservations = [
      createMockReservation({ id: 'res-1', priorityScore: 60, status: '候补中', createdAt: '2026-06-01T10:00:00Z' }),
      createMockReservation({ id: 'res-2', priorityScore: 80, status: '候补中', createdAt: '2026-06-02T10:00:00Z' }),
      createMockReservation({ id: 'res-3', priorityScore: 70, status: '候补中', createdAt: '2026-06-03T10:00:00Z' })
    ];
    const result = computeQueuePositions(reservations);
    expect(result.find(r => r.id === 'res-2').queuePosition).toBe(1);
    expect(result.find(r => r.id === 'res-3').queuePosition).toBe(2);
    expect(result.find(r => r.id === 'res-1').queuePosition).toBe(3);
  });

  it('优先级相同时按创建时间升序分配队列位置', () => {
    const reservations = [
      createMockReservation({ id: 'res-1', priorityScore: 70, status: '候补中', createdAt: '2026-06-03T10:00:00Z' }),
      createMockReservation({ id: 'res-2', priorityScore: 70, status: '候补中', createdAt: '2026-06-01T10:00:00Z' }),
      createMockReservation({ id: 'res-3', priorityScore: 70, status: '候补中', createdAt: '2026-06-02T10:00:00Z' })
    ];
    const result = computeQueuePositions(reservations);
    expect(result.find(r => r.id === 'res-2').queuePosition).toBe(1);
    expect(result.find(r => r.id === 'res-3').queuePosition).toBe(2);
    expect(result.find(r => r.id === 'res-1').queuePosition).toBe(3);
  });

  it('非候补中状态的排队位置为0', () => {
    const reservations = [
      createMockReservation({ id: 'res-1', status: '已转正', priorityScore: 80 }),
      createMockReservation({ id: 'res-2', status: '候补中', priorityScore: 70 })
    ];
    const result = computeQueuePositions(reservations);
    const activated = result.find(r => r.id === 'res-1');
    const waiting = result.find(r => r.id === 'res-2');
    expect(activated.queuePosition).toBe(0);
    expect(waiting.queuePosition).toBe(1);
  });
});

describe('reservationTransform - 过期处理', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-14T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('候补中且已过期的记录应标记为已过期', () => {
    const reservations = [
      createMockReservation({
        id: 'res-expired',
        start: iso(-10),
        end: iso(-5),
        status: '候补中'
      }),
      createMockReservation({
        id: 'res-active',
        start: iso(5),
        end: iso(7),
        status: '候补中'
      })
    ];
    const result = expireOutdatedReservations(reservations);
    expect(result.find(r => r.id === 'res-expired').status).toBe('已过期');
    expect(result.find(r => r.id === 'res-active').status).toBe('候补中');
  });

  it('非候补中状态的记录不会被过期处理', () => {
    const reservations = [
      createMockReservation({
        id: 'res-activated',
        start: iso(-10),
        end: iso(-5),
        status: '已转正'
      })
    ];
    const result = expireOutdatedReservations(reservations);
    expect(result[0].status).toBe('已转正');
  });

  it('过期处理会更新updatedAt字段', () => {
    const oldDate = new Date('2026-06-01T10:00:00Z').toISOString();
    const reservations = [
      createMockReservation({
        id: 'res-expired',
        start: iso(-10),
        end: iso(-5),
        status: '候补中',
        updatedAt: oldDate
      })
    ];
    const result = expireOutdatedReservations(reservations);
    expect(result[0].updatedAt).not.toBe(oldDate);
  });
});

describe('reservationTransform - 转正校验', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-14T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('正常候补中记录且无冲突时校验通过', () => {
    const reservation = createMockReservation({
      id: 'res-ok',
      gearId: 'gear-001',
      start: iso(5),
      end: iso(7),
      status: '候补中'
    });
    const gears = [createMockGear({ id: 'gear-001', status: '可借' })];
    const result = validateActivation(reservation, { requests: [], gears });
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('状态不是候补中时校验失败', () => {
    const reservation = createMockReservation({
      id: 'res-activated',
      status: '已转正'
    });
    const gears = [createMockGear({ id: 'gear-001', status: '可借' })];
    const result = validateActivation(reservation, { requests: [], gears });
    expect(result.ok).toBe(false);
    expect(result.errors.some(e => e.code === 'invalid_status')).toBe(true);
  });

  it('已生成申请的记录校验失败（防止重复转正）', () => {
    const reservation = createMockReservation({
      id: 'res-dup',
      status: '候补中',
      generatedRequestId: 'req-existing'
    });
    const gears = [createMockGear({ id: 'gear-001', status: '可借' })];
    const result = validateActivation(reservation, { requests: [], gears });
    expect(result.ok).toBe(false);
    expect(result.errors.some(e => e.code === 'already_has_request')).toBe(true);
    expect(result.errors[0].message).toContain('请勿重复操作');
  });

  it('已过期的记录校验失败', () => {
    const reservation = createMockReservation({
      id: 'res-expired',
      start: iso(-10),
      end: iso(-5),
      status: '候补中'
    });
    const gears = [createMockGear({ id: 'gear-001', status: '可借' })];
    const result = validateActivation(reservation, { requests: [], gears });
    expect(result.ok).toBe(false);
    expect(result.errors.some(e => e.code === 'expired')).toBe(true);
  });

  it('装备状态为借出中时校验失败', () => {
    const reservation = createMockReservation({
      id: 'res-1',
      gearId: 'gear-001',
      status: '候补中'
    });
    const gears = [createMockGear({ id: 'gear-001', status: '借出中' })];
    const result = validateActivation(reservation, { requests: [], gears });
    expect(result.ok).toBe(false);
    expect(result.errors.some(e => e.code === 'gear_unavailable')).toBe(true);
    expect(result.errors[0].message).toContain('不可借出');
  });

  it('装备状态为不可借时校验失败', () => {
    const reservation = createMockReservation({
      id: 'res-1',
      gearId: 'gear-001',
      status: '候补中'
    });
    const gears = [createMockGear({ id: 'gear-001', status: '不可借' })];
    const result = validateActivation(reservation, { requests: [], gears });
    expect(result.ok).toBe(false);
    expect(result.errors.some(e => e.code === 'gear_unavailable')).toBe(true);
  });

  it('装备不存在时校验失败', () => {
    const reservation = createMockReservation({
      id: 'res-1',
      gearId: 'gear-nonexistent',
      status: '候补中'
    });
    const gears = [createMockGear({ id: 'gear-001', status: '可借' })];
    const result = validateActivation(reservation, { requests: [], gears });
    expect(result.ok).toBe(false);
    expect(result.errors.some(e => e.code === 'gear_missing')).toBe(true);
  });

  it('日期冲突时校验失败', () => {
    const reservation = createMockReservation({
      id: 'res-1',
      gearId: 'gear-001',
      start: iso(5),
      end: iso(7),
      status: '候补中'
    });
    const gears = [createMockGear({ id: 'gear-001', status: '可借' })];
    const requests = [
      createMockRequest({
        id: 'req-conflict',
        gearId: 'gear-001',
        start: iso(4),
        end: iso(6),
        status: '借出中'
      })
    ];
    const result = validateActivation(reservation, { requests, gears });
    expect(result.ok).toBe(false);
    expect(result.errors.some(e => e.code === 'date_conflict')).toBe(true);
  });

  it('日期不冲突时校验通过', () => {
    const reservation = createMockReservation({
      id: 'res-1',
      gearId: 'gear-001',
      start: iso(10),
      end: iso(12),
      status: '候补中'
    });
    const gears = [createMockGear({ id: 'gear-001', status: '可借' })];
    const requests = [
      createMockRequest({
        id: 'req-ok',
        gearId: 'gear-001',
        start: iso(5),
        end: iso(7),
        status: '借出中'
      })
    ];
    const result = validateActivation(reservation, { requests, gears });
    expect(result.ok).toBe(true);
  });

  it('已拒绝或已归还的申请不参与冲突判断', () => {
    const reservation = createMockReservation({
      id: 'res-1',
      gearId: 'gear-001',
      start: iso(5),
      end: iso(7),
      status: '候补中'
    });
    const gears = [createMockGear({ id: 'gear-001', status: '可借' })];
    const requests = [
      createMockRequest({
        id: 'req-rejected',
        gearId: 'gear-001',
        start: iso(5),
        end: iso(7),
        status: '已拒绝'
      }),
      createMockRequest({
        id: 'req-returned',
        gearId: 'gear-001',
        start: iso(5),
        end: iso(7),
        status: '已归还'
      })
    ];
    const result = validateActivation(reservation, { requests, gears });
    expect(result.ok).toBe(true);
  });
});

describe('reservationTransform - 冲突判断', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-14T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('装备不可借时检测到装备状态冲突', () => {
    const reservation = createMockReservation({
      gearId: 'gear-001',
      status: '候补中'
    });
    const gears = [createMockGear({ id: 'gear-001', status: '不可借' })];
    const result = analyzeConflicts(reservation, { requests: [], gears, healthInfoMap: {} });
    const gearConflict = result.conflicts.find(c => c.type === CONFLICT_TYPES.GEAR_STATUS);
    expect(gearConflict).toBeDefined();
    expect(gearConflict.severity).toBe('warning');
    expect(gearConflict.canResolve).toBe(false);
  });

  it('装备借出中时冲突可解决', () => {
    const reservation = createMockReservation({
      gearId: 'gear-001',
      status: '候补中'
    });
    const gears = [createMockGear({ id: 'gear-001', status: '借出中' })];
    const result = analyzeConflicts(reservation, { requests: [], gears, healthInfoMap: {} });
    const gearConflict = result.conflicts.find(c => c.type === CONFLICT_TYPES.GEAR_STATUS);
    expect(gearConflict.canResolve).toBe(true);
  });

  it('健康分低时检测到健康风险冲突', () => {
    const reservation = createMockReservation({
      gearId: 'gear-001',
      status: '候补中'
    });
    const gears = [createMockGear({ id: 'gear-001', status: '可借' })];
    const healthInfoMap = {
      'gear-001': createMockHealthInfo({
        overallHealthScore: 45,
        damageCount: 3,
        maintenancePlanStatus: { status: 'overdue', daysOverdue: 15 }
      })
    };
    const result = analyzeConflicts(reservation, { requests: [], gears, healthInfoMap });
    const healthConflict = result.conflicts.find(c => c.type === CONFLICT_TYPES.HEALTH_RISK);
    expect(healthConflict).toBeDefined();
    expect(healthConflict.severity).toBe('info');
    expect(healthConflict.details.risks.length).toBeGreaterThan(0);
  });

  it('已生成申请时检测到严重冲突', () => {
    const reservation = createMockReservation({
      id: 'res-1',
      status: '候补中',
      generatedRequestId: 'req-existing'
    });
    const gears = [createMockGear({ id: 'gear-001', status: '可借' })];
    const result = analyzeConflicts(reservation, { requests: [], gears, healthInfoMap: {} });
    const requestConflict = result.conflicts.find(c => c.type === CONFLICT_TYPES.ALREADY_HAS_REQUEST);
    expect(requestConflict).toBeDefined();
    expect(requestConflict.severity).toBe('critical');
    expect(requestConflict.canResolve).toBe(false);
    expect(result.hasCriticalConflicts).toBe(true);
  });

  it('返回正确的冲突摘要信息', () => {
    const reservation = createMockReservation({
      id: 'res-1',
      start: iso(-10),
      end: iso(-5),
      status: '候补中',
      generatedRequestId: 'req-existing'
    });
    const result = analyzeConflicts(reservation, { requests: [], gears: [], healthInfoMap: {} });
    expect(result.hasConflicts).toBe(true);
    expect(result.hasCriticalConflicts).toBe(true);
    expect(result.conflicts.length).toBeGreaterThanOrEqual(2);
  });
});

describe('reservationTransform - 批量转正', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-14T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('批量处理时跳过校验失败的记录', () => {
    const validReservation = createMockReservation({
      id: 'res-valid',
      gearId: 'gear-001',
      start: iso(5),
      end: iso(7),
      status: '候补中',
      priorityScore: 80
    });
    const invalidReservation = createMockReservation({
      id: 'res-invalid',
      gearId: 'gear-001',
      start: iso(5),
      end: iso(7),
      status: '已转正'
    });
    const reviewItems = [
      { reservation: validReservation, canActivate: true, selected: true },
      { reservation: invalidReservation, canActivate: false, selected: true }
    ];
    const gears = [createMockGear({ id: 'gear-001', status: '可借' })];
    const result = batchActivateReservations(reviewItems, { gears, requests: [] }, {});
    expect(result.successCount).toBe(1);
    expect(result.errorCount).toBe(1);
    expect(result.newRequests).toHaveLength(1);
    expect(result.updatedReservations).toHaveLength(1);
    expect(result.errors[0].reservationId).toBe('res-invalid');
  });

  it('批量处理时避免互相日期冲突', () => {
    const res1 = createMockReservation({
      id: 'res-1',
      gearId: 'gear-001',
      start: iso(5),
      end: iso(7),
      status: '候补中',
      priorityScore: 80
    });
    const res2 = createMockReservation({
      id: 'res-2',
      gearId: 'gear-001',
      start: iso(6),
      end: iso(8),
      status: '候补中',
      priorityScore: 70
    });
    const reviewItems = [
      { reservation: res1, canActivate: true, selected: true },
      { reservation: res2, canActivate: true, selected: true }
    ];
    const gears = [createMockGear({ id: 'gear-001', status: '可借' })];
    const result = batchActivateReservations(reviewItems, { gears, requests: [] }, {});
    expect(result.successCount).toBe(1);
    expect(result.errorCount).toBe(1);
    expect(result.updatedReservations[0].id).toBe('res-1');
    expect(result.errors[0].reservationId).toBe('res-2');
    expect(result.errors[0].errors.some(e => e.code === 'date_conflict')).toBe(true);
  });

  it('批量处理支持调整日期后转正', () => {
    const res1 = createMockReservation({
      id: 'res-1',
      gearId: 'gear-001',
      start: iso(5),
      end: iso(7),
      status: '候补中',
      priorityScore: 80
    });
    const reviewItems = [
      {
        reservation: res1,
        canActivate: true,
        selected: true,
        adjustedStart: iso(10),
        adjustedEnd: iso(12)
      }
    ];
    const gears = [createMockGear({ id: 'gear-001', status: '可借' })];
    const result = batchActivateReservations(reviewItems, { gears, requests: [] }, {});
    expect(result.successCount).toBe(1);
    expect(result.newRequests[0].start).toBe(iso(10));
    expect(result.newRequests[0].end).toBe(iso(12));
  });
});

describe('reservationTransform - 查找可转正记录', () => {
  it('选择优先级最高且无冲突的记录', () => {
    const resHighPriority = createMockReservation({
      id: 'res-high',
      gearId: 'gear-001',
      priorityScore: 90,
      status: '候补中',
      generatedRequestId: ''
    });
    const resLowPriority = createMockReservation({
      id: 'res-low',
      gearId: 'gear-001',
      priorityScore: 70,
      status: '候补中',
      generatedRequestId: ''
    });
    const reservations = [resLowPriority, resHighPriority];
    const gears = [createMockGear({ id: 'gear-001', status: '可借' })];
    const result = findActivatableReservations(reservations, { requests: [], gears });
    expect(result.id).toBe('res-high');
  });

  it('装备不可借时无可转正记录', () => {
    const reservation = createMockReservation({
      id: 'res-1',
      gearId: 'gear-001',
      status: '候补中',
      generatedRequestId: ''
    });
    const gears = [createMockGear({ id: 'gear-001', status: '借出中' })];
    const result = findActivatableReservations([reservation], { requests: [], gears });
    expect(result).toBeNull();
  });

  it('已生成申请的记录不参与选择', () => {
    const reservation = createMockReservation({
      id: 'res-1',
      gearId: 'gear-001',
      status: '候补中',
      generatedRequestId: 'req-existing'
    });
    const gears = [createMockGear({ id: 'gear-001', status: '可借' })];
    const result = findActivatableReservations([reservation], { requests: [], gears });
    expect(result).toBeNull();
  });
});

describe('reservationTransform - 其他核心函数', () => {
  it('createReservation 生成正确的默认字段', () => {
    const result = createReservation({
      gearId: 'gear-001',
      gearName: '测试帐篷',
      owner: '张三',
      borrower: '李四',
      start: '2026-06-20',
      end: '2026-06-22'
    });
    expect(result.status).toBe('候补中');
    expect(result.priorityScore).toBe(0);
    expect(result.queuePosition).toBe(0);
    expect(result.generatedRequestId).toBe('');
    expect(result.id).toBeDefined();
    expect(result.createdAt).toBeDefined();
  });

  it('activateReservation 更新状态和关联字段', () => {
    const oldDate = '2026-06-01T10:00:00Z';
    const reservation = createMockReservation({ status: '候补中', updatedAt: oldDate });
    const result = activateReservation(reservation, 'req-new-123');
    expect(result.status).toBe('已转正');
    expect(result.generatedRequestId).toBe('req-new-123');
    expect(result.activatedAt).toBeDefined();
    expect(result.updatedAt).not.toBe(oldDate);
  });

  it('cancelReservation 取消候补', () => {
    const oldDate = '2026-06-01T10:00:00Z';
    const reservation = createMockReservation({ status: '候补中', updatedAt: oldDate });
    const result = cancelReservation(reservation);
    expect(result.status).toBe('已取消');
    expect(result.updatedAt).not.toBe(oldDate);
  });

  it('skipReservation 标记为审核跳过', () => {
    const reservation = createMockReservation({ status: '候补中' });
    const result = skipReservation(reservation, '暂不处理');
    expect(result.status).toBe('审核跳过');
    expect(result.reviewNotes).toBe('暂不处理');
  });

  it('recalcAllPriorities 只更新候补中记录的优先级', () => {
    const reservations = [
      createMockReservation({ id: 'res-1', status: '候补中', priorityScore: 0 }),
      createMockReservation({ id: 'res-2', status: '已转正', priorityScore: 0 })
    ];
    const result = recalcAllPriorities(reservations, {
      requests: [],
      handovers: [],
      healthInfoMap: {}
    });
    expect(result.find(r => r.id === 'res-1').priorityScore).toBeGreaterThan(0);
    expect(result.find(r => r.id === 'res-2').priorityScore).toBe(0);
  });

  it('createRequestFromReservation 正确生成借用申请', () => {
    const reservation = createMockReservation({
      gearId: 'gear-001',
      gearName: '测试帐篷',
      start: '2026-06-20',
      end: '2026-06-22',
      reason: '装备借出中'
    });
    const gear = createMockGear({ id: 'gear-001', owner: '张三' });
    const result = createRequestFromReservation(reservation, gear);
    expect(result.status).toBe('待处理');
    expect(result.reason).toContain('候补转正');
    expect(result.fromReservationId).toBe(reservation.id);
    expect(result.owner).toBe('张三');
  });
});

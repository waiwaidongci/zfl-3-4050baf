import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ref } from 'vue';
import { useReservation } from '../../composables/useReservation.js';
import {
  createMockGear,
  createMockRequest,
  createMockReservation,
  createMockHandover,
  createMockHealthInfo,
  iso
} from '../testData.js';

describe('useReservation - 手动转正', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-14T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('doActivate: 正常候补中记录可成功转正', () => {
    const reservation = createMockReservation({
      id: 'res-1',
      gearId: 'gear-001',
      start: iso(5),
      end: iso(7),
      status: '候补中',
      generatedRequestId: ''
    });
    const gear = createMockGear({ id: 'gear-001', status: '可借' });

    const reservations = ref([reservation]);
    const gears = ref([gear]);
    const requests = ref([]);

    const { doActivate } = useReservation({
      reservations,
      gears,
      requests,
      handovers: ref([]),
      members: ref([]),
      currentUser: ref('张三'),
      healthInfoMap: ref({})
    });

    const result = doActivate('res-1');
    expect(result.ok).toBe(true);
    expect(result.reservation.status).toBe('已转正');
    expect(result.reservation.generatedRequestId).toBe(result.request.id);
    expect(result.request.status).toBe('待处理');
    expect(result.request.fromReservationId).toBe('res-1');
  });

  it('doActivate: 装备不可借时转正失败', () => {
    const reservation = createMockReservation({
      id: 'res-1',
      gearId: 'gear-001',
      status: '候补中'
    });
    const gear = createMockGear({ id: 'gear-001', status: '不可借' });

    const reservations = ref([reservation]);
    const gears = ref([gear]);
    const requests = ref([]);

    const { doActivate } = useReservation({
      reservations,
      gears,
      requests,
      handovers: ref([]),
      members: ref([]),
      currentUser: ref('张三'),
      healthInfoMap: ref({})
    });

    const result = doActivate('res-1');
    expect(result.ok).toBe(false);
    expect(result.errors.some(e => e.code === 'gear_unavailable')).toBe(true);
    expect(result.reservation).toBeNull();
  });

  it('doActivate: 已生成申请的记录转正失败（防止重复转正）', () => {
    const reservation = createMockReservation({
      id: 'res-1',
      gearId: 'gear-001',
      status: '候补中',
      generatedRequestId: 'req-existing'
    });
    const gear = createMockGear({ id: 'gear-001', status: '可借' });

    const reservations = ref([reservation]);
    const gears = ref([gear]);
    const requests = ref([]);

    const { doActivate } = useReservation({
      reservations,
      gears,
      requests,
      handovers: ref([]),
      members: ref([]),
      currentUser: ref('张三'),
      healthInfoMap: ref({})
    });

    const result = doActivate('res-1');
    expect(result.ok).toBe(false);
    expect(result.errors.some(e => e.code === 'already_has_request')).toBe(true);
    expect(result.errors[0].message).toContain('请勿重复操作');
  });

  it('doActivate: 日期冲突时转正失败', () => {
    const reservation = createMockReservation({
      id: 'res-1',
      gearId: 'gear-001',
      start: iso(5),
      end: iso(7),
      status: '候补中'
    });
    const gear = createMockGear({ id: 'gear-001', status: '可借' });
    const existingRequest = createMockRequest({
      id: 'req-conflict',
      gearId: 'gear-001',
      start: iso(5),
      end: iso(7),
      status: '借出中'
    });

    const reservations = ref([reservation]);
    const gears = ref([gear]);
    const requests = ref([existingRequest]);

    const { doActivate } = useReservation({
      reservations,
      gears,
      requests,
      handovers: ref([]),
      members: ref([]),
      currentUser: ref('张三'),
      healthInfoMap: ref({})
    });

    const result = doActivate('res-1');
    expect(result.ok).toBe(false);
    expect(result.errors.some(e => e.code === 'date_conflict')).toBe(true);
  });

  it('doActivate: 已过期记录转正失败', () => {
    const reservation = createMockReservation({
      id: 'res-expired',
      gearId: 'gear-001',
      start: iso(-10),
      end: iso(-5),
      status: '候补中'
    });
    const gear = createMockGear({ id: 'gear-001', status: '可借' });

    const reservations = ref([reservation]);
    const gears = ref([gear]);
    const requests = ref([]);

    const { doActivate } = useReservation({
      reservations,
      gears,
      requests,
      handovers: ref([]),
      members: ref([]),
      currentUser: ref('张三'),
      healthInfoMap: ref({})
    });

    const result = doActivate('res-expired');
    expect(result.ok).toBe(false);
    expect(result.errors.some(e => e.code === 'expired')).toBe(true);
  });

  it('doActivate: 不存在的记录转正失败', () => {
    const reservations = ref([]);
    const gears = ref([]);
    const requests = ref([]);

    const { doActivate } = useReservation({
      reservations,
      gears,
      requests,
      handovers: ref([]),
      members: ref([]),
      currentUser: ref('张三'),
      healthInfoMap: ref({})
    });

    const result = doActivate('nonexistent-id');
    expect(result.ok).toBe(false);
    expect(result.errors.some(e => e.code === 'not_found')).toBe(true);
  });

  it('doActivate: 非候补中状态转正失败', () => {
    const reservation = createMockReservation({
      id: 'res-1',
      gearId: 'gear-001',
      status: '已取消'
    });
    const gear = createMockGear({ id: 'gear-001', status: '可借' });

    const reservations = ref([reservation]);
    const gears = ref([gear]);
    const requests = ref([]);

    const { doActivate } = useReservation({
      reservations,
      gears,
      requests,
      handovers: ref([]),
      members: ref([]),
      currentUser: ref('张三'),
      healthInfoMap: ref({})
    });

    const result = doActivate('res-1');
    expect(result.ok).toBe(false);
    expect(result.errors.some(e => e.code === 'invalid_status')).toBe(true);
  });
});

describe('useReservation - 自动检查转正', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-14T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('checkAndActivate: 自动处理过期并转正优先级最高的记录', () => {
    const expiredReservation = createMockReservation({
      id: 'res-expired',
      gearId: 'gear-001',
      start: iso(-10),
      end: iso(-5),
      status: '候补中',
      priorityScore: 90
    });
    const highPriorityReservation = createMockReservation({
      id: 'res-high',
      gearId: 'gear-002',
      start: iso(5),
      end: iso(7),
      status: '候补中',
      priorityScore: 80
    });
    const lowPriorityReservation = createMockReservation({
      id: 'res-low',
      gearId: 'gear-003',
      start: iso(10),
      end: iso(12),
      status: '候补中',
      priorityScore: 60
    });

    const gears = [
      createMockGear({ id: 'gear-001', status: '可借' }),
      createMockGear({ id: 'gear-002', status: '可借' }),
      createMockGear({ id: 'gear-003', status: '可借' })
    ];

    const reservations = ref([expiredReservation, highPriorityReservation, lowPriorityReservation]);
    const gearsRef = ref(gears);
    const requests = ref([]);
    const handovers = ref([createMockHandover({ borrower: '王五' })]);

    const { checkAndActivate } = useReservation({
      reservations,
      gears: gearsRef,
      requests,
      handovers,
      members: ref([]),
      currentUser: ref('张三'),
      healthInfoMap: ref({})
    });

    const result = checkAndActivate();
    expect(result.activated).toContain('res-high');
    expect(result.newRequests).toHaveLength(1);
    expect(result.list.find(r => r.id === 'res-expired').status).toBe('已过期');
    expect(result.list.find(r => r.id === 'res-high').status).toBe('已转正');
  });

  it('checkAndActivate: 装备不可借时不自动转正', () => {
    const reservation = createMockReservation({
      id: 'res-1',
      gearId: 'gear-001',
      status: '候补中',
      priorityScore: 80
    });
    const gear = createMockGear({ id: 'gear-001', status: '借出中' });

    const reservations = ref([reservation]);
    const gears = ref([gear]);
    const requests = ref([]);

    const { checkAndActivate } = useReservation({
      reservations,
      gears,
      requests,
      handovers: ref([]),
      members: ref([]),
      currentUser: ref('张三'),
      healthInfoMap: ref({})
    });

    const result = checkAndActivate();
    expect(result.activated).toHaveLength(0);
    expect(result.newRequests).toHaveLength(0);
  });
});

describe('useReservation - 批量审核', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-14T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('analyzeForReview: 正确生成审核列表', () => {
    const res1 = createMockReservation({
      id: 'res-1',
      gearId: 'gear-001',
      start: iso(5),
      end: iso(7),
      status: '候补中',
      priorityScore: 80,
      createdAt: '2026-06-01T10:00:00Z'
    });
    const res2 = createMockReservation({
      id: 'res-2',
      gearId: 'gear-002',
      start: iso(10),
      end: iso(12),
      status: '候补中',
      priorityScore: 70,
      createdAt: '2026-06-02T10:00:00Z'
    });
    const expiredRes = createMockReservation({
      id: 'res-expired',
      gearId: 'gear-003',
      start: iso(-10),
      end: iso(-5),
      status: '候补中'
    });

    const gears = [
      createMockGear({ id: 'gear-001', status: '可借' }),
      createMockGear({ id: 'gear-002', status: '可借' }),
      createMockGear({ id: 'gear-003', status: '可借' })
    ];

    const reservations = ref([res1, res2, expiredRes]);
    const gearsRef = ref(gears);
    const requests = ref([]);

    const { analyzeForReview } = useReservation({
      reservations,
      gears: gearsRef,
      requests,
      handovers: ref([]),
      members: ref([]),
      currentUser: ref('张三'),
      healthInfoMap: ref({})
    });

    const items = analyzeForReview();
    expect(items).toHaveLength(2);
    expect(items[0].id).toBe('res-1');
    expect(items[0].canActivate).toBe(true);
    expect(items[0].priorityScore).toBeGreaterThan(0);
    expect(items[0].priorityScore).not.toBe(80);
    expect(items[1].id).toBe('res-2');
    expect(items[0].priorityScore).toBeGreaterThan(items[1].priorityScore);
    const expiredInList = items.find(i => i.id === 'res-expired');
    expect(expiredInList).toBeUndefined();
  });

  it('toggleReviewMode: 切换审核模式并触发分析', () => {
    const reservations = ref([createMockReservation()]);
    const gears = ref([createMockGear({ id: 'gear-001', status: '可借' })]);
    const requests = ref([]);

    const { reviewMode, toggleReviewMode, reviewItems } = useReservation({
      reservations,
      gears,
      requests,
      handovers: ref([]),
      members: ref([]),
      currentUser: ref('张三'),
      healthInfoMap: ref({})
    });

    expect(reviewMode.value).toBe(false);
    const result = toggleReviewMode();
    expect(result).toBe(true);
    expect(reviewMode.value).toBe(true);
    expect(reviewItems.value.length).toBeGreaterThan(0);
  });

  it('selectAllReviewItems: 只选择可转正的项', () => {
    const reservations = ref([
      createMockReservation({ id: 'res-1', gearId: 'gear-001', status: '候补中', priorityScore: 80 }),
      createMockReservation({ id: 'res-2', gearId: 'gear-002', status: '候补中', priorityScore: 70 })
    ]);
    const gears = ref([
      createMockGear({ id: 'gear-001', status: '可借' }),
      createMockGear({ id: 'gear-002', status: '不可借' })
    ]);
    const requests = ref([]);

    const { toggleReviewMode, selectAllReviewItems, reviewItems } = useReservation({
      reservations,
      gears,
      requests,
      handovers: ref([]),
      members: ref([]),
      currentUser: ref('张三'),
      healthInfoMap: ref({})
    });

    toggleReviewMode();
    selectAllReviewItems(true);

    const selected = reviewItems.value.filter(i => i.selected);
    expect(selected).toHaveLength(1);
    expect(selected[0].id).toBe('res-1');
  });

  it('toggleSelectReviewItem: 切换单个项的选中状态', () => {
    const reservations = ref([createMockReservation({ id: 'res-1', gearId: 'gear-001' })]);
    const gears = ref([createMockGear({ id: 'gear-001', status: '可借' })]);
    const requests = ref([]);

    const { toggleReviewMode, toggleSelectReviewItem, reviewItems } = useReservation({
      reservations,
      gears,
      requests,
      handovers: ref([]),
      members: ref([]),
      currentUser: ref('张三'),
      healthInfoMap: ref({})
    });

    toggleReviewMode();
    expect(reviewItems.value[0].selected).toBe(false);

    toggleSelectReviewItem('res-1');
    expect(reviewItems.value[0].selected).toBe(true);

    toggleSelectReviewItem('res-1');
    expect(reviewItems.value[0].selected).toBe(false);
  });

  it('batchProcessReview: 批量处理选中的项', () => {
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
      gearId: 'gear-002',
      start: iso(10),
      end: iso(12),
      status: '候补中',
      priorityScore: 70
    });
    const res3 = createMockReservation({
      id: 'res-3',
      gearId: 'gear-003',
      start: iso(15),
      end: iso(17),
      status: '候补中',
      priorityScore: 60
    });

    const gears = [
      createMockGear({ id: 'gear-001', status: '可借' }),
      createMockGear({ id: 'gear-002', status: '可借' }),
      createMockGear({ id: 'gear-003', status: '可借' })
    ];

    const reservations = ref([res1, res2, res3]);
    const gearsRef = ref(gears);
    const requests = ref([]);

    const { toggleReviewMode, selectAllReviewItems, batchProcessReview, reviewItems } = useReservation({
      reservations,
      gears: gearsRef,
      requests,
      handovers: ref([]),
      members: ref([]),
      currentUser: ref('张三'),
      healthInfoMap: ref({})
    });

    toggleReviewMode();
    selectAllReviewItems(true);

    const result = batchProcessReview('confirm');
    expect(result.successCount).toBe(3);
    expect(result.errorCount).toBe(0);
    expect(result.newRequests).toHaveLength(3);
    expect(result.finalList.filter(r => r.status === '已转正')).toHaveLength(3);
  });

  it('batchProcessReview: 支持跳过和调整日期', () => {
    const resConfirm = createMockReservation({
      id: 'res-confirm',
      gearId: 'gear-001',
      start: iso(5),
      end: iso(7),
      status: '候补中',
      priorityScore: 80
    });
    const resSkip = createMockReservation({
      id: 'res-skip',
      gearId: 'gear-002',
      start: iso(10),
      end: iso(12),
      status: '候补中',
      priorityScore: 70
    });
    const resAdjust = createMockReservation({
      id: 'res-adjust',
      gearId: 'gear-003',
      start: iso(5),
      end: iso(7),
      status: '候补中',
      priorityScore: 60
    });

    const gears = [
      createMockGear({ id: 'gear-001', status: '可借' }),
      createMockGear({ id: 'gear-002', status: '可借' }),
      createMockGear({ id: 'gear-003', status: '可借' })
    ];

    const reservations = ref([resConfirm, resSkip, resAdjust]);
    const gearsRef = ref(gears);
    const requests = ref([]);

    const {
      toggleReviewMode,
      selectAllReviewItems,
      setItemAction,
      setItemAdjustedDates,
      batchProcessReview
    } = useReservation({
      reservations,
      gears: gearsRef,
      requests,
      handovers: ref([]),
      members: ref([]),
      currentUser: ref('张三'),
      healthInfoMap: ref({})
    });

    toggleReviewMode();
    selectAllReviewItems(true);
    setItemAction('res-skip', 'skip', '稍后再处理');
    setItemAdjustedDates('res-adjust', iso(20), iso(22));

    const result = batchProcessReview('confirm');
    expect(result.successCount).toBe(1);
    expect(result.skippedCount).toBe(1);
    expect(result.adjustedCount).toBe(1);

    const finalList = result.finalList;
    expect(finalList.find(r => r.id === 'res-confirm').status).toBe('已转正');
    expect(finalList.find(r => r.id === 'res-skip').status).toBe('审核跳过');
    expect(finalList.find(r => r.id === 'res-skip').reviewNotes).toBe('稍后再处理');
    expect(finalList.find(r => r.id === 'res-adjust').start).toBe(iso(20));
    expect(finalList.find(r => r.id === 'res-adjust').end).toBe(iso(22));
    expect(finalList.find(r => r.id === 'res-adjust').status).toBe('候补中');
  });

  it('batchProcessReview: 日期冲突时只处理第一个', () => {
    const res1 = createMockReservation({
      id: 'res-1',
      gearId: 'gear-001',
      start: iso(5),
      end: iso(7),
      status: '候补中',
      priorityScore: 80,
      createdAt: '2026-06-01T10:00:00Z'
    });
    const res2 = createMockReservation({
      id: 'res-2',
      gearId: 'gear-001',
      start: iso(6),
      end: iso(8),
      status: '候补中',
      priorityScore: 70,
      createdAt: '2026-06-02T10:00:00Z'
    });

    const gears = [createMockGear({ id: 'gear-001', status: '可借' })];
    const reservations = ref([res1, res2]);
    const gearsRef = ref(gears);
    const requests = ref([]);

    const { toggleReviewMode, selectAllReviewItems, batchProcessReview } = useReservation({
      reservations,
      gears: gearsRef,
      requests,
      handovers: ref([]),
      members: ref([]),
      currentUser: ref('张三'),
      healthInfoMap: ref({})
    });

    toggleReviewMode();
    selectAllReviewItems(true);

    const result = batchProcessReview('confirm');
    expect(result.successCount).toBe(1);
    expect(result.errorCount).toBe(1);
    expect(result.errors[0].reservationId).toBe('res-2');
  });
});

describe('useReservation - 组合逻辑辅助函数', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-14T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sortedQueue: 正确排序队列', () => {
    const res1 = createMockReservation({
      id: 'res-1',
      gearId: 'gear-001',
      status: '候补中',
      priorityScore: 70,
      updatedAt: '2026-06-10T10:00:00Z'
    });
    const res2 = createMockReservation({
      id: 'res-2',
      gearId: 'gear-001',
      status: '候补中',
      priorityScore: 80,
      updatedAt: '2026-06-09T10:00:00Z'
    });
    const resActivated = createMockReservation({
      id: 'res-act',
      gearId: 'gear-001',
      status: '已转正',
      updatedAt: '2026-06-11T10:00:00Z'
    });

    const reservations = ref([res1, res2, resActivated]);
    const gears = ref([]);
    const requests = ref([]);

    const { sortedQueue } = useReservation({
      reservations,
      gears,
      requests,
      handovers: ref([]),
      members: ref([]),
      currentUser: ref('张三'),
      healthInfoMap: ref({})
    });

    expect(sortedQueue.value[0].id).toBe('res-2');
    expect(sortedQueue.value[1].id).toBe('res-1');
    expect(sortedQueue.value[2].id).toBe('res-act');
  });

  it('addReservation: 添加候补并计算优先级', () => {
    const reservations = ref([]);
    const gears = ref([createMockGear({ id: 'gear-001', status: '可借' })]);
    const requests = ref([]);
    const handovers = ref([
      createMockHandover({ borrower: '王五' }),
      createMockHandover({ borrower: '王五', id: 'hand-2' })
    ]);

    const { addReservation } = useReservation({
      reservations,
      gears,
      requests,
      handovers,
      members: ref([]),
      currentUser: ref('张三'),
      healthInfoMap: ref({})
    });

    const newReservation = addReservation({
      gearId: 'gear-001',
      borrower: '王五',
      start: iso(2),
      end: iso(4),
      reason: '装备借出中'
    });

    expect(newReservation).not.toBeNull();
    expect(newReservation.status).toBe('候补中');
    expect(newReservation.priorityScore).toBeGreaterThan(0);
    expect(newReservation.borrower).toBe('王五');
  });

  it('addReservation: 装备不存在时返回null', () => {
    const reservations = ref([]);
    const gears = ref([]);
    const requests = ref([]);

    const { addReservation } = useReservation({
      reservations,
      gears,
      requests,
      handovers: ref([]),
      members: ref([]),
      currentUser: ref('张三'),
      healthInfoMap: ref({})
    });

    const result = addReservation({
      gearId: 'nonexistent',
      borrower: '王五',
      start: iso(5),
      end: iso(7)
    });

    expect(result).toBeNull();
  });

  it('getQueueForGear: 获取指定装备的排队列表', () => {
    const res1 = createMockReservation({ id: 'res-1', gearId: 'gear-001', status: '候补中', priorityScore: 80 });
    const res2 = createMockReservation({ id: 'res-2', gearId: 'gear-001', status: '候补中', priorityScore: 70 });
    const res3 = createMockReservation({ id: 'res-3', gearId: 'gear-002', status: '候补中' });

    const reservations = ref([res1, res2, res3]);
    const gears = ref([]);
    const requests = ref([]);

    const { getQueueForGear } = useReservation({
      reservations,
      gears,
      requests,
      handovers: ref([]),
      members: ref([]),
      currentUser: ref('张三'),
      healthInfoMap: ref({})
    });

    const queue = getQueueForGear('gear-001');
    expect(queue).toHaveLength(2);
    expect(queue[0].id).toBe('res-1');
    expect(queue[1].id).toBe('res-2');
  });

  it('analyzeItemConflicts: 分析单项冲突', () => {
    const reservation = createMockReservation({
      id: 'res-1',
      gearId: 'gear-001',
      start: iso(5),
      end: iso(7),
      status: '候补中',
      generatedRequestId: 'req-existing'
    });
    const gear = createMockGear({ id: 'gear-001', status: '不可借' });

    const reservations = ref([reservation]);
    const gears = ref([gear]);
    const requests = ref([]);

    const { analyzeItemConflicts } = useReservation({
      reservations,
      gears,
      requests,
      handovers: ref([]),
      members: ref([]),
      currentUser: ref('张三'),
      healthInfoMap: ref({})
    });

    const result = analyzeItemConflicts('res-1');
    expect(result.hasConflicts).toBe(true);
    expect(result.hasCriticalConflicts).toBe(true);
    expect(result.conflicts.some(c => c.type === 'alreadyHasRequest')).toBe(true);
    expect(result.conflicts.some(c => c.type === 'gearStatus')).toBe(true);
  });

  it('hasReservationForGear: 检查装备是否有重叠候补', () => {
    const res1 = createMockReservation({
      id: 'res-1',
      gearId: 'gear-001',
      start: iso(5),
      end: iso(7),
      status: '候补中'
    });

    const reservations = ref([res1]);
    const gears = ref([]);
    const requests = ref([]);

    const { hasReservationForGear } = useReservation({
      reservations,
      gears,
      requests,
      handovers: ref([]),
      members: ref([]),
      currentUser: ref('张三'),
      healthInfoMap: ref({})
    });

    expect(hasReservationForGear('gear-001', iso(6), iso(8))).toBe(true);
    expect(hasReservationForGear('gear-001', iso(10), iso(12))).toBe(false);
    expect(hasReservationForGear('gear-002', iso(5), iso(7))).toBe(false);
  });

  it('doCancel: 取消候补中记录', () => {
    const reservation = createMockReservation({
      id: 'res-1',
      status: '候补中'
    });
    const cancelledReservation = createMockReservation({
      id: 'res-2',
      status: '已取消'
    });

    const reservations = ref([reservation, cancelledReservation]);
    const gears = ref([]);
    const requests = ref([]);

    const { doCancel } = useReservation({
      reservations,
      gears,
      requests,
      handovers: ref([]),
      members: ref([]),
      currentUser: ref('张三'),
      healthInfoMap: ref({})
    });

    const result = doCancel('res-1');
    expect(result.status).toBe('已取消');

    const alreadyCancelledResult = doCancel('res-2');
    expect(alreadyCancelledResult).toBeNull();

    const notFoundResult = doCancel('nonexistent');
    expect(notFoundResult).toBeNull();
  });

  it('stats: 正确统计各状态数量', () => {
    const reservations = ref([
      createMockReservation({ id: 'res-1', status: '候补中' }),
      createMockReservation({ id: 'res-2', status: '候补中' }),
      createMockReservation({ id: 'res-3', status: '已转正' }),
      createMockReservation({ id: 'res-4', status: '已取消' }),
      createMockReservation({ id: 'res-5', status: '已过期' }),
      createMockReservation({ id: 'res-6', status: '审核跳过' })
    ]);
    const gears = ref([]);
    const requests = ref([]);

    const { stats } = useReservation({
      reservations,
      gears,
      requests,
      handovers: ref([]),
      members: ref([]),
      currentUser: ref('张三'),
      healthInfoMap: ref({})
    });

    expect(stats.value.total).toBe(6);
    expect(stats.value.active).toBe(2);
    expect(stats.value.activated).toBe(1);
    expect(stats.value.cancelled).toBe(1);
    expect(stats.value.expired).toBe(1);
    expect(stats.value.skipped).toBe(1);
  });
});

describe('useReservation - 健康分影响优先级', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-14T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('健康分低的装备候补上优先级会降低', () => {
    const res1 = createMockReservation({
      id: 'res-1',
      gearId: 'gear-healthy',
      borrower: '王五',
      start: iso(5),
      end: iso(7),
      status: '候补中'
    });
    const res2 = createMockReservation({
      id: 'res-2',
      gearId: 'gear-unhealthy',
      borrower: '赵六',
      start: iso(5),
      end: iso(7),
      status: '候补中'
    });

    const gears = [
      createMockGear({ id: 'gear-healthy', status: '可借' }),
      createMockGear({ id: 'gear-unhealthy', status: '可借' })
    ];

    const healthInfoMap = ref({
      'gear-healthy': createMockHealthInfo({ overallHealthScore: 85 }),
      'gear-unhealthy': createMockHealthInfo({ overallHealthScore: 40, damageCount: 5 })
    });

    const reservations = ref([res1, res2]);
    const gearsRef = ref(gears);
    const requests = ref([]);
    const handovers = ref([createMockHandover({ borrower: '王五' }), createMockHandover({ borrower: '赵六' })]);

    const { recalcPriorities, sortedQueue } = useReservation({
      reservations,
      gears: gearsRef,
      requests,
      handovers,
      members: ref([]),
      currentUser: ref('张三'),
      healthInfoMap
    });

    const recalculated = recalcPriorities();
    const score1 = recalculated.find(r => r.id === 'res-1').priorityScore;
    const score2 = recalculated.find(r => r.id === 'res-2').priorityScore;

    expect(score1).toBeGreaterThan(score2);
    expect(score1 - score2).toBe(10);
  });

  it('批量审核时健康分低的装备会显示警告', () => {
    const reservation = createMockReservation({
      id: 'res-1',
      gearId: 'gear-unhealthy',
      start: iso(5),
      end: iso(7),
      status: '候补中'
    });
    const gear = createMockGear({ id: 'gear-unhealthy', status: '可借' });

    const healthInfoMap = ref({
      'gear-unhealthy': createMockHealthInfo({
        overallHealthScore: 35,
        damageCount: 3,
        depositDeductCount: 2,
        maintenancePlanStatus: { status: 'overdue', daysOverdue: 30 }
      })
    });

    const reservations = ref([reservation]);
    const gears = ref([gear]);
    const requests = ref([]);

    const { analyzeForReview } = useReservation({
      reservations,
      gears,
      requests,
      handovers: ref([]),
      members: ref([]),
      currentUser: ref('张三'),
      healthInfoMap
    });

    const items = analyzeForReview();
    expect(items[0].canActivate).toBe(true);
    expect(items[0].warnings.some(w => w.type === 'healthRisk')).toBe(true);
    expect(items[0].healthRisks.overallLevel).toBe('danger');
    expect(items[0].healthRisks.risks.length).toBeGreaterThan(0);
  });
});

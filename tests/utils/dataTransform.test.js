import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  normalizeMembers,
  normalizeGears,
  normalizeRequests,
  normalizeTrips,
  normalizeDepositRecords,
  normalizeInventoryLists,
  normalizeSettlementRecords,
  validateAndNormalizeImportData,
  buildImportPreviewResult,
  analyzeMergeData,
  performMerge,
  findGearByIdOrName,
  getDefaultMaintenancePlan,
  ENTITY_LABELS,
  DATA_ENTITIES
} from '../../utils/dataTransform.js';
import { createMockGear, createMockRequest, iso } from '../testData.js';

describe('dataTransform - 常量与工具函数', () => {
  it('ENTITY_LABELS 包含所有实体类型', () => {
    expect(ENTITY_LABELS.members).toBe('成员');
    expect(ENTITY_LABELS.gears).toBe('装备');
    expect(ENTITY_LABELS.requests).toBe('申请');
    expect(ENTITY_LABELS.trips).toBe('出行');
    expect(ENTITY_LABELS.depositRecords).toBe('押金');
    expect(ENTITY_LABELS.inventoryLists).toBe('盘点单');
    expect(ENTITY_LABELS.settlementRecords).toBe('费用结算');
    expect(ENTITY_LABELS.reservations).toBe('候补预约');
  });

  it('DATA_ENTITIES 包含所有实体键', () => {
    expect(DATA_ENTITIES).toContain('members');
    expect(DATA_ENTITIES).toContain('gears');
    expect(DATA_ENTITIES).toContain('requests');
    expect(DATA_ENTITIES).toContain('trips');
  });

  it('findGearByIdOrName 按 ID 查找', () => {
    const gearList = [
      { id: 'g1', name: '帐篷', owner: '张三' },
      { id: 'g2', name: '睡袋', owner: '李四' }
    ];
    const result = findGearByIdOrName(gearList, 'g1', '', '');
    expect(result.id).toBe('g1');
  });

  it('findGearByIdOrName 按名称和所有者查找', () => {
    const gearList = [
      { id: 'g1', name: '帐篷', owner: '张三' },
      { id: 'g2', name: '帐篷', owner: '李四' }
    ];
    const result = findGearByIdOrName(gearList, '', '帐篷', '李四');
    expect(result.id).toBe('g2');
  });

  it('getDefaultMaintenancePlan 返回默认保养计划', () => {
    const gear = { name: '帐篷' };
    const plan = getDefaultMaintenancePlan(gear);
    expect(plan.maintenanceCycleDays).toBe(30);
    expect(plan.maintenanceReminderLevel).toBe('标准');
    expect(plan.nextMaintenanceDate).toBeDefined();
  });

  it('getDefaultMaintenancePlan 使用装备的保养周期', () => {
    const gear = { maintenanceCycleDays: 60, nextMaintenanceDate: '2026-12-01', maintenanceReminderLevel: '严格' };
    const plan = getDefaultMaintenancePlan(gear);
    expect(plan.maintenanceCycleDays).toBe(60);
    expect(plan.nextMaintenanceDate).toBe('2026-12-01');
    expect(plan.maintenanceReminderLevel).toBe('严格');
  });
});

describe('dataTransform - 成员归一化', () => {
  it('normalizeMembers 正常归一化成员数据', () => {
    const rawMembers = [
      { id: 'm1', nickname: '张三', phone: '13800138000', area: '北京', notes: '老用户' },
      { nickname: '李四' }
    ];
    const result = normalizeMembers(rawMembers);

    expect(result.data).toHaveLength(2);
    expect(result.data[0].nickname).toBe('张三');
    expect(result.data[0].phone).toBe('13800138000');
    expect(result.data[1].id).toBeDefined();
    expect(result.warnings).toHaveLength(0);
  });

  it('normalizeMembers 跳过缺少昵称的成员', () => {
    const rawMembers = [
      { nickname: '张三' },
      { phone: '13800138000' },
      { nickname: '李四' }
    ];
    const result = normalizeMembers(rawMembers);

    expect(result.data).toHaveLength(2);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('缺少昵称');
  });

  it('normalizeMembers 非数组返回空数组和警告', () => {
    const result = normalizeMembers('not an array');
    expect(result.data).toEqual([]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('不是数组');
  });

  it('normalizeMembers 跳过格式异常的数据', () => {
    const rawMembers = [
      { nickname: '张三' },
      null,
      'string',
      { nickname: '李四' }
    ];
    const result = normalizeMembers(rawMembers);
    expect(result.data).toHaveLength(2);
    expect(result.warnings.length).toBeGreaterThanOrEqual(2);
  });
});

describe('dataTransform - 装备归一化', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-14T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('normalizeGears 正常归一化装备数据', () => {
    const rawGears = [
      { id: 'g1', name: '帐篷', category: '帐篷', owner: '张三', deposit: 200, status: '可借', notes: '双人帐篷' }
    ];
    const result = normalizeGears(rawGears);

    expect(result.data).toHaveLength(1);
    expect(result.data[0].name).toBe('帐篷');
    expect(result.data[0].category).toBe('帐篷');
    expect(result.data[0].owner).toBe('张三');
    expect(result.data[0].deposit).toBe('200');
    expect(result.data[0].status).toBe('可借');
    expect(result.data[0].maintenanceCycleDays).toBe(30);
  });

  it('normalizeGears 跳过缺少名称的装备', () => {
    const rawGears = [
      { name: '帐篷' },
      { owner: '张三' },
      { name: '睡袋' }
    ];
    const result = normalizeGears(rawGears);
    expect(result.data).toHaveLength(2);
    expect(result.warnings).toHaveLength(1);
  });

  it('normalizeGears 非数组返回空', () => {
    const result = normalizeGears(null);
    expect(result.data).toEqual([]);
    expect(result.warnings).toHaveLength(1);
  });

  it('normalizeGears 押金转为字符串', () => {
    const rawGears = [
      { name: '帐篷', deposit: 100 },
      { name: '睡袋', deposit: '50' }
    ];
    const result = normalizeGears(rawGears);
    expect(result.data[0].deposit).toBe('100');
    expect(result.data[1].deposit).toBe('50');
  });
});

describe('dataTransform - 申请归一化', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-14T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('normalizeRequests 关联装备信息', () => {
    const gearList = [
      { id: 'g1', name: '帐篷', owner: '张三' }
    ];
    const rawRequests = [
      { id: 'r1', gearId: 'g1', borrower: '李四', start: iso(5), end: iso(7), status: '待处理' }
    ];
    const result = normalizeRequests(rawRequests, gearList);

    expect(result.data).toHaveLength(1);
    expect(result.data[0].gearName).toBe('帐篷');
    expect(result.data[0].owner).toBe('张三');
  });

  it('normalizeRequests 无装备匹配时保留导入数据', () => {
    const rawRequests = [
      { gearName: '未知装备', borrower: '李四' }
    ];
    const result = normalizeRequests(rawRequests, []);

    expect(result.data).toHaveLength(1);
    expect(result.data[0].gearName).toBe('未知装备');
  });

  it('normalizeRequests 无装备名且无法匹配时标记警告', () => {
    const rawRequests = [
      { gearId: 'nonexistent', borrower: '李四' }
    ];
    const result = normalizeRequests(rawRequests, []);

    expect(result.data).toHaveLength(1);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('无法匹配装备');
  });
});

describe('dataTransform - 出行归一化', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-14T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('normalizeTrips 验证成员和装备', () => {
    const gearList = [
      { id: 'g1', name: '帐篷', owner: '张三', deposit: '200' }
    ];
    const memberList = [
      { nickname: '张三' },
      { nickname: '李四' }
    ];
    const rawTrips = [
      {
        destination: '海边露营',
        startDate: iso(10),
        members: ['张三', '李四', '王五'],
        gears: [{ gearId: 'g1', status: '待借' }]
      }
    ];
    const result = normalizeTrips(rawTrips, gearList, memberList);

    expect(result.data).toHaveLength(1);
    expect(result.data[0].members).toHaveLength(2);
    expect(result.data[0].gears).toHaveLength(1);
    expect(result.warnings).toContainEqual(expect.stringContaining('王五'));
  });

  it('normalizeTrips 装备未匹配但有名称时保留', () => {
    const rawTrips = [
      {
        destination: '露营',
        members: [],
        gears: [{ gearName: '未知装备', owner: '某人' }]
      }
    ];
    const result = normalizeTrips(rawTrips, [], []);

    expect(result.data[0].gears).toHaveLength(1);
    expect(result.warnings).toContainEqual(expect.stringContaining('未匹配到现有装备'));
  });
});

describe('dataTransform - 押金归一化', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-14T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('normalizeDepositRecords 金额转为字符串', () => {
    const rawRecords = [
      {
        borrower: '李四',
        depositAmount: 200,
        receivedAmount: 200,
        deductedAmount: 50,
        refundedAmount: 150
      }
    ];
    const result = normalizeDepositRecords(rawRecords, [], []);

    expect(result.data[0].depositAmount).toBe('200');
    expect(result.data[0].receivedAmount).toBe('200');
    expect(result.data[0].deductedAmount).toBe('50');
    expect(result.data[0].refundedAmount).toBe('150');
  });

  it('normalizeDepositRecords 从装备获取押金金额', () => {
    const gearList = [
      { id: 'g1', name: '帐篷', owner: '张三', deposit: '300' }
    ];
    const rawRecords = [
      { gearId: 'g1', borrower: '李四' }
    ];
    const result = normalizeDepositRecords(rawRecords, gearList, []);

    expect(result.data[0].depositAmount).toBe('300');
  });
});

describe('dataTransform - 盘点归一化', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-14T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('normalizeInventoryLists 正常归一化盘点单', () => {
    const gearList = [
      { id: 'g1', name: '帐篷', owner: '张三' }
    ];
    const memberList = [
      { nickname: '管理员' }
    ];
    const rawLists = [
      {
        name: '出行前盘点',
        type: '出行前',
        status: '进行中',
        checker: '管理员',
        items: [
          { gearId: 'g1', checkStatus: '已盘点', missingAccessories: '', notes: '' }
        ]
      }
    ];
    const result = normalizeInventoryLists(rawLists, gearList, [], memberList);

    expect(result.data).toHaveLength(1);
    expect(result.data[0].name).toBe('出行前盘点');
    expect(result.data[0].items[0].gearName).toBe('帐篷');
    expect(result.data[0].items[0].hasAbnormal).toBe(false);
  });

  it('normalizeInventoryLists 检测异常项', () => {
    const rawLists = [
      {
        name: '盘点',
        items: [
          { gearName: '帐篷', checkStatus: '缺失' },
          { gearName: '睡袋', checkStatus: '已盘点', missingAccessories: '枕头' },
          { gearName: '炉头', checkStatus: '已盘点', notes: '有划痕' }
        ]
      }
    ];
    const result = normalizeInventoryLists(rawLists, [], [], []);

    expect(result.data[0].items[0].hasAbnormal).toBe(true);
    expect(result.data[0].items[1].hasAbnormal).toBe(true);
    expect(result.data[0].items[2].hasAbnormal).toBe(true);
  });
});

describe('dataTransform - 导入验证与归一化', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-14T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('validateAndNormalizeImportData 完整数据导入', () => {
    const rawData = {
      _exportVersion: '1.0',
      members: [{ nickname: '张三' }, { nickname: '李四' }],
      gears: [{ name: '帐篷', owner: '张三', deposit: 200 }],
      requests: [{ gearName: '帐篷', owner: '张三', borrower: '李四' }],
      trips: [{ destination: '露营', members: ['张三', '李四'], gears: [{ gearName: '帐篷', owner: '张三' }] }],
      depositRecords: [{ gearName: '帐篷', owner: '张三', borrower: '李四', depositAmount: 200 }],
      inventoryLists: [{ name: '盘点', items: [{ gearName: '帐篷', checkStatus: '已盘点' }] }],
      settlementRecords: [{ name: '结算单', members: [{ nickname: '张三' }, { nickname: '李四' }] }],
      reservations: [{ gearName: '帐篷', owner: '张三', borrower: '王五', start: iso(10), end: iso(12) }]
    };

    const result = validateAndNormalizeImportData(rawData);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.summary.members).toBe(2);
    expect(result.summary.gears).toBe(1);
    expect(result.summary.requests).toBe(1);
    expect(result.summary.trips).toBe(1);
    expect(result.summary.depositRecords).toBe(1);
    expect(result.summary.inventoryLists).toBe(1);
    expect(result.summary.settlementRecords).toBe(1);
    expect(result.summary.reservations).toBe(1);
  });

  it('validateAndNormalizeImportData 空数据也是有效的', () => {
    const result = validateAndNormalizeImportData({});
    expect(result.valid).toBe(true);
    expect(result.data).toBeDefined();
  });

  it('validateAndNormalizeImportData 非对象返回错误', () => {
    const result = validateAndNormalizeImportData('invalid');
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('validateAndNormalizeImportData 检测旧版格式', () => {
    const rawData = {
      members: [],
      gears: []
    };
    const result = validateAndNormalizeImportData(rawData);
    expect(result.summary.hasLegacyFormat).toBe(true);
    expect(result.warnings).toContainEqual(expect.stringContaining('旧版数据格式'));
  });

  it('validateAndNormalizeImportData 检测模板格式', () => {
    const rawData = {
      _isTemplate: true,
      _templateName: '基础模板',
      members: [{ nickname: '张三' }]
    };
    const result = validateAndNormalizeImportData(rawData);
    expect(result.summary.isTemplateFormat).toBe(true);
    expect(result.summary.templateName).toBe('基础模板');
  });
});

describe('dataTransform - 导入预览与合并', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-14T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('buildImportPreviewResult null 返回错误', () => {
    const result = buildImportPreviewResult(null, {});
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(expect.stringContaining('JSON 解析失败'));
  });

  it('buildImportPreviewResult 非对象返回错误', () => {
    const result = buildImportPreviewResult('string', {});
    expect(result.valid).toBe(false);
  });

  it('analyzeMergeData 检测新增和跳过项', () => {
    const currentData = {
      members: [{ id: 'm1', nickname: '张三' }]
    };
    const importedData = {
      members: [
        { nickname: '张三' },
        { nickname: '李四' }
      ]
    };

    const { analysis, summary } = analyzeMergeData(currentData, importedData);

    expect(analysis.members.added).toBe(1);
    expect(analysis.members.skipped).toBe(1);
    expect(summary.totalAdded).toBe(1);
    expect(summary.totalSkipped).toBe(1);
  });

  it('performMerge 执行合并', () => {
    const currentData = {
      members: [{ id: 'm1', nickname: '张三' }]
    };
    const importedData = {
      members: [
        { id: 'm2', nickname: '李四' }
      ]
    };

    const mergeAnalysis = analyzeMergeData(currentData, importedData);
    const result = performMerge(currentData, importedData, mergeAnalysis);

    expect(result.members).toHaveLength(2);
    expect(result.members.find(m => m.nickname === '张三')).toBeDefined();
    expect(result.members.find(m => m.nickname === '李四')).toBeDefined();
  });
});

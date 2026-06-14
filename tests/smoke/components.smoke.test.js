import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { ref } from 'vue';
import InventoryPanel from '../../components/InventoryPanel.vue';
import ReservationPanel from '../../components/ReservationPanel.vue';
import SettlementPanel from '../../components/SettlementPanel.vue';
import DataImportExport from '../../components/DataImportExport.vue';
import ReservationReviewPanel from '../../components/ReservationReviewPanel.vue';

const createMockGear = (id, name, owner = '张三') => ({
  id,
  name,
  owner,
  category: '帐篷',
  status: '可借',
  deposit: '200',
  notes: '',
  damage: '',
  maintenanceCycleDays: 30,
  nextMaintenanceDate: '2026-07-14',
  maintenanceReminderLevel: '标准'
});

const createMockMember = (id, nickname) => ({
  id,
  nickname,
  phone: '',
  area: '',
  notes: ''
});

const createMockInventoryList = (id, name, status = '进行中') => ({
  id,
  name,
  type: '出行前',
  tripId: '',
  tripName: '',
  date: '2026-06-14',
  status,
  checker: '张三',
  notes: '',
  items: [],
  createdAt: '2026-06-14T10:00:00Z',
  updatedAt: '2026-06-14T10:00:00Z'
});

const createMockReservation = (id, gearId, status = '候补中') => ({
  id,
  gearId,
  gearName: '测试帐篷',
  owner: '张三',
  borrower: '李四',
  start: '2026-06-20',
  end: '2026-06-22',
  status,
  reason: '装备借出中',
  notes: '',
  requestId: '',
  generatedRequestId: '',
  priorityScore: 50,
  queuePosition: 1,
  createdAt: '2026-06-14T10:00:00Z',
  updatedAt: '2026-06-14T10:00:00Z',
  activatedAt: null
});

const createMockSettlement = (id, name, status = '草稿') => ({
  id,
  tripId: '',
  tripName: '',
  name,
  status,
  members: [],
  extraExpenses: [],
  totalDeposit: '0',
  totalDeducted: '0',
  totalExtraExpenses: '0',
  totalPerMember: '0',
  notes: '',
  createdAt: '2026-06-14',
  updatedAt: '2026-06-14'
});

describe('组件冒烟测试 - InventoryPanel', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-14T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('InventoryPanel 能正常挂载渲染', () => {
    const inventoryLists = [createMockInventoryList('inv-1', '测试盘点单')];
    const gears = [createMockGear('gear-1', '帐篷')];
    const members = [createMockMember('m1', '张三')];
    const trips = [];

    const wrapper = mount(InventoryPanel, {
      props: {
        inventoryLists,
        gears,
        trips,
        members,
        currentUser: '张三'
      },
      global: {
        stubs: {
          InventoryList: true,
          InventoryDetail: true
        }
      }
    });

    expect(wrapper.exists()).toBe(true);
    expect(wrapper.classes()).toContain('inventory-panel');
    expect(wrapper.find('h2').text()).toContain('新建盘点单');
  });

  it('InventoryPanel 显示盘点单列表', () => {
    const inventoryLists = [
      createMockInventoryList('inv-1', '盘点单1', '进行中'),
      createMockInventoryList('inv-2', '盘点单2', '已完成')
    ];
    const gears = [createMockGear('gear-1', '帐篷')];
    const members = [createMockMember('m1', '张三')];

    const wrapper = mount(InventoryPanel, {
      props: {
        inventoryLists,
        gears,
        trips: [],
        members,
        currentUser: '张三'
      },
      global: {
        stubs: {
          InventoryList: {
            props: ['lists'],
            template: '<div class="inventory-list-stub"><span v-for="l in lists" :key="l.id">{{ l.name }}</span></div>'
          },
          InventoryDetail: true
        }
      }
    });

    expect(wrapper.find('.inventory-list-stub').exists()).toBe(true);
  });

  it('InventoryPanel 空状态下也能正常渲染', () => {
    const wrapper = mount(InventoryPanel, {
      props: {
        inventoryLists: [],
        gears: [],
        trips: [],
        members: [],
        currentUser: '张三'
      },
      global: {
        stubs: {
          InventoryList: true,
          InventoryDetail: true
        }
      }
    });

    expect(wrapper.exists()).toBe(true);
    expect(wrapper.find('form').exists()).toBe(true);
  });
});

describe('组件冒烟测试 - ReservationPanel', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-14T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('ReservationPanel 能正常挂载渲染', () => {
    const reservations = [createMockReservation('res-1', 'gear-1')];
    const gears = [createMockGear('gear-1', '帐篷')];
    const members = [createMockMember('m1', '张三')];

    const wrapper = mount(ReservationPanel, {
      props: {
        reservations,
        gears,
        requests: [],
        handovers: [],
        members,
        currentUser: '张三',
        healthInfoMap: {}
      },
      global: {
        stubs: {
          ReservationReviewPanel: true
        }
      }
    });

    expect(wrapper.exists()).toBe(true);
    expect(wrapper.classes()).toContain('reservation-panel');
  });

  it('ReservationPanel 显示候补队列标题', () => {
    const reservations = [createMockReservation('res-1', 'gear-1')];
    const gears = [createMockGear('gear-1', '帐篷')];
    const members = [createMockMember('m1', '张三')];

    const wrapper = mount(ReservationPanel, {
      props: {
        reservations,
        gears,
        requests: [],
        handovers: [],
        members,
        currentUser: '张三',
        healthInfoMap: {}
      },
      global: {
        stubs: {
          ReservationReviewPanel: true
        }
      }
    });

    expect(wrapper.text()).toContain('提交候补预约');
    expect(wrapper.text()).toContain('候补队列');
  });

  it('ReservationPanel 空状态渲染', () => {
    const wrapper = mount(ReservationPanel, {
      props: {
        reservations: [],
        gears: [],
        requests: [],
        handovers: [],
        members: [],
        currentUser: '',
        healthInfoMap: {}
      },
      global: {
        stubs: {
          ReservationReviewPanel: true
        }
      }
    });

    expect(wrapper.exists()).toBe(true);
  });
});

describe('组件冒烟测试 - SettlementPanel', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-14T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('SettlementPanel 能正常挂载渲染', () => {
    const settlements = [createMockSettlement('set-1', '测试结算单')];
    const members = [createMockMember('m1', '张三')];

    const wrapper = mount(SettlementPanel, {
      props: {
        settlementRecords: settlements,
        trips: [],
        members,
        depositRecords: [],
        gears: [],
        requests: [],
        inventoryLists: []
      },
      global: {
        stubs: {}
      }
    });

    expect(wrapper.exists()).toBe(true);
    expect(wrapper.classes()).toContain('settlement-panel');
  });

  it('SettlementPanel 显示新建结算单表单', () => {
    const members = [createMockMember('m1', '张三')];

    const wrapper = mount(SettlementPanel, {
      props: {
        settlementRecords: [],
        trips: [],
        members,
        depositRecords: [],
        gears: [],
        requests: [],
        inventoryLists: []
      },
      global: {
        stubs: {}
      }
    });

    expect(wrapper.text()).toContain('新建结算单');
    expect(wrapper.find('form').exists()).toBe(true);
  });

  it('SettlementPanel 显示结算单列表', () => {
    const settlements = [
      createMockSettlement('set-1', '结算单1', '草稿'),
      createMockSettlement('set-2', '结算单2', '已确认')
    ];
    const members = [createMockMember('m1', '张三')];

    const wrapper = mount(SettlementPanel, {
      props: {
        settlementRecords: settlements,
        trips: [],
        members,
        depositRecords: [],
        gears: [],
        requests: [],
        inventoryLists: []
      },
      global: {
        stubs: {}
      }
    });

    expect(wrapper.text()).toContain('结算单列表');
    expect(wrapper.text()).toContain('结算单1');
    expect(wrapper.text()).toContain('结算单2');
  });
});

describe('组件冒烟测试 - DataImportExport', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-14T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const createMockSpaceData = () => ({
    members: [],
    gears: [],
    requests: [],
    reservations: [],
    inventoryLists: [],
    settlementRecords: [],
    depositRecords: [],
    trips: [],
    eventLogs: []
  });

  it('DataImportExport 能正常挂载渲染', () => {
    const wrapper = mount(DataImportExport, {
      props: {
        spaceData: createMockSpaceData(),
        spaceInfo: {}
      },
      global: {
        stubs: {
          ImportPreview: true
        }
      }
    });

    expect(wrapper.exists()).toBe(true);
  });

  it('DataImportExport 显示导入导出按钮', () => {
    const wrapper = mount(DataImportExport, {
      props: {
        spaceData: createMockSpaceData(),
        spaceInfo: {}
      },
      global: {
        stubs: {
          ImportPreview: true
        }
      }
    });

    expect(wrapper.text()).toContain('数据导入');
    expect(wrapper.text()).toContain('数据导出');
  });
});

describe('组件冒烟测试 - 空数据边界', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-14T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('所有面板在完全空数据下不崩溃', () => {
    const inventoryWrapper = mount(InventoryPanel, {
      props: {
        inventoryLists: [],
        gears: [],
        trips: [],
        members: [],
        currentUser: ''
      },
      global: {
        stubs: {
          InventoryList: true,
          InventoryDetail: true
        }
      }
    });
    expect(inventoryWrapper.exists()).toBe(true);

    const reservationWrapper = mount(ReservationPanel, {
      props: {
        reservations: [],
        gears: [],
        requests: [],
        handovers: [],
        members: [],
        currentUser: '',
        healthInfoMap: {}
      },
      global: {
        stubs: {
          ReservationReviewPanel: true
        }
      }
    });
    expect(reservationWrapper.exists()).toBe(true);

    const settlementWrapper = mount(SettlementPanel, {
      props: {
        settlementRecords: [],
        trips: [],
        members: [],
        depositRecords: [],
        gears: [],
        requests: [],
        inventoryLists: []
      },
      global: {
        stubs: {}
      }
    });
    expect(settlementWrapper.exists()).toBe(true);
  });
});

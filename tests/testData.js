const iso = (offset = 0) => {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
};

export const createMockGear = (overrides = {}) => ({
  id: 'gear-' + Math.random().toString(36).substring(2, 9),
  name: '测试帐篷',
  owner: '张三',
  status: '可借',
  category: '帐篷',
  ...overrides
});

export const createMockRequest = (overrides = {}) => ({
  id: 'req-' + Math.random().toString(36).substring(2, 9),
  gearId: 'gear-001',
  gearName: '测试帐篷',
  owner: '张三',
  borrower: '李四',
  start: iso(1),
  end: iso(3),
  status: '借出中',
  reason: '露营活动',
  damage: '',
  createdAt: new Date().toISOString(),
  ...overrides
});

export const createMockReservation = (overrides = {}) => ({
  id: 'res-' + Math.random().toString(36).substring(2, 9),
  gearId: 'gear-001',
  gearName: '测试帐篷',
  owner: '张三',
  borrower: '王五',
  start: iso(5),
  end: iso(7),
  status: '候补中',
  reason: '装备借出中',
  notes: '',
  requestId: '',
  generatedRequestId: '',
  priorityScore: 50,
  queuePosition: 0,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  activatedAt: null,
  ...overrides
});

export const createMockHandover = (overrides = {}) => ({
  id: 'hand-' + Math.random().toString(36).substring(2, 9),
  gearId: 'gear-001',
  borrower: '王五',
  owner: '张三',
  ownerConfirmed: true,
  borrowerConfirmed: true,
  createdAt: new Date().toISOString(),
  ...overrides
});

export const createMockHealthInfo = (overrides = {}) => ({
  overallHealthScore: 85,
  damageCount: 0,
  depositDeductCount: 0,
  daysSinceLastMaintenance: 15,
  maintenancePlanStatus: { status: 'good' },
  ...overrides
});

export const testScenarios = {
  gearUnavailable: {
    gears: [createMockGear({ id: 'gear-001', status: '借出中' })],
    requests: [],
    reservations: [createMockReservation({ gearId: 'gear-001', status: '候补中' })]
  },
  dateConflict: {
    gears: [createMockGear({ id: 'gear-001', status: '可借' })],
    requests: [
      createMockRequest({
        id: 'req-conflict',
        gearId: 'gear-001',
        start: iso(5),
        end: iso(7),
        status: '借出中'
      })
    ],
    reservations: [
      createMockReservation({
        gearId: 'gear-001',
        start: iso(6),
        end: iso(8)
      })
    ]
  },
  alreadyHasRequest: {
    gears: [createMockGear({ id: 'gear-001', status: '可借' })],
    requests: [createMockRequest({ id: 'req-001', gearId: 'gear-001' })],
    reservations: [
      createMockReservation({
        gearId: 'gear-001',
        generatedRequestId: 'req-001',
        status: '已转正'
      })
    ]
  },
  duplicateActivation: {
    gears: [createMockGear({ id: 'gear-001', status: '可借' })],
    requests: [],
    reservations: [
      createMockReservation({
        id: 'res-dup',
        gearId: 'gear-001',
        generatedRequestId: 'req-existing'
      })
    ]
  },
  lowHealthScore: {
    healthInfoMap: {
      'gear-001': createMockHealthInfo({
        overallHealthScore: 45,
        damageCount: 3,
        depositDeductCount: 1
      })
    }
  },
  expiredReservation: {
    gears: [createMockGear({ id: 'gear-001', status: '可借' })],
    requests: [],
    reservations: [
      createMockReservation({
        id: 'res-expired',
        gearId: 'gear-001',
        start: iso(-10),
        end: iso(-5),
        status: '候补中'
      })
    ]
  }
};

export { iso };

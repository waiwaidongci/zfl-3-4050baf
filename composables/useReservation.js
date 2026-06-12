import { computed } from 'vue';
import {
  createReservation,
  calculatePriorityScore,
  computeQueuePositions,
  findActivatableReservations,
  activateReservation,
  cancelReservation,
  expireOutdatedReservations,
  recalcAllPriorities,
  getReservationStats,
  RESERVATION_STATUSES
} from '../utils/reservationTransform.js';

function resolve(val) {
  if (val === null || val === undefined) return val;
  if (typeof val === 'object' && 'value' in val) return val.value;
  return val;
}

export function useReservation({ reservations, gears, requests, handovers, members, currentUser, healthInfoMap }) {
  const reservationList = computed(() => resolve(reservations) || []);
  const gearList = computed(() => resolve(gears) || []);
  const requestList = computed(() => resolve(requests) || []);
  const handoverList = computed(() => resolve(handovers) || []);
  const memberList = computed(() => resolve(members) || []);
  const user = computed(() => resolve(currentUser) || '');
  const healthMap = computed(() => resolve(healthInfoMap) || {});

  const activeReservations = computed(() =>
    reservationList.value.filter((r) => r.status === '候补中')
  );

  const activatedReservations = computed(() =>
    reservationList.value.filter((r) => r.status === '已转正')
  );

  const stats = computed(() => getReservationStats(reservationList.value));

  const sortedQueue = computed(() => {
    const withPositions = computeQueuePositions(reservationList.value);
    return withPositions.sort((a, b) => {
      if (a.status === '候补中' && b.status !== '候补中') return -1;
      if (a.status !== '候补中' && b.status === '候补中') return 1;
      if (a.status === '候补中' && b.status === '候补中') {
        if (b.queuePosition !== a.queuePosition) return a.queuePosition - b.queuePosition;
      }
      return b.updatedAt.localeCompare(a.updatedAt);
    });
  });

  function getContextForPriority() {
    return {
      requests: requestList.value,
      handovers: handoverList.value,
      healthInfoMap: healthMap.value
    };
  }

  function addReservation({ gearId, borrower, start, end, reason, notes, requestId }) {
    const gear = gearList.value.find((g) => g.id === gearId);
    if (!gear) return null;

    const newRes = createReservation({
      gearId: gear.id,
      gearName: gear.name,
      owner: gear.owner,
      borrower: borrower || user.value,
      start,
      end,
      reason,
      notes,
      requestId: requestId || ''
    });

    const ctx = getContextForPriority();
    newRes.priorityScore = calculatePriorityScore(newRes, ctx);

    return newRes;
  }

  function doCancel(reservationId) {
    const reservation = reservationList.value.find((r) => r.id === reservationId);
    if (!reservation || reservation.status !== '候补中') return null;
    return cancelReservation(reservation);
  }

  function doActivate(reservationId) {
    const reservation = reservationList.value.find((r) => r.id === reservationId);
    if (!reservation || reservation.status !== '候补中') return null;
    return activateReservation(reservation);
  }

  function checkAndActivate() {
    const expired = expireOutdatedReservations(reservationList.value);
    const withPriorities = recalcAllPriorities(expired, getContextForPriority());

    const activatable = findActivatableReservations(withPriorities, {
      requests: requestList.value,
      gears: gearList.value
    });

    const updated = withPriorities.map((r) => {
      if (activatable && r.id === activatable.id) {
        return activateReservation(r);
      }
      return r;
    });

    const finalList = computeQueuePositions(updated);
    return { list: finalList, activated: activatable ? [activatable.id] : [] };
  }

  function recalcPriorities() {
    return recalcAllPriorities(reservationList.value, getContextForPriority());
  }

  function getQueueForGear(gearId) {
    return sortedQueue.value.filter((r) => r.gearId === gearId);
  }

  function getReservationsForGear(gearId) {
    return reservationList.value.filter((r) => r.gearId === gearId);
  }

  function getMyReservations(borrower) {
    const name = borrower || user.value;
    return reservationList.value.filter((r) => r.borrower === name);
  }

  function getReservationsByStatus(status) {
    if (!RESERVATION_STATUSES.includes(status)) return [];
    return reservationList.value.filter((r) => r.status === status);
  }

  function hasReservationForGear(gearId, start, end, excludeId) {
    return reservationList.value.some((r) => {
      if (r.status !== '候补中') return false;
      if (r.gearId !== gearId) return false;
      if (excludeId && r.id === excludeId) return false;
      const rStart = new Date(r.start);
      const rEnd = new Date(r.end);
      const sStart = new Date(start);
      const sEnd = new Date(end);
      return sStart <= rEnd && sEnd >= rStart;
    });
  }

  function getGearReservationCount(gearId) {
    return reservationList.value.filter((r) => r.gearId === gearId && r.status === '候补中').length;
  }

  function updateReservation(reservationId, updates) {
    const reservation = reservationList.value.find((r) => r.id === reservationId);
    if (!reservation) return null;
    return {
      ...reservation,
      ...updates,
      updatedAt: new Date().toISOString()
    };
  }

  return {
    reservationList,
    activeReservations,
    activatedReservations,
    stats,
    sortedQueue,
    addReservation,
    doCancel,
    doActivate,
    checkAndActivate,
    recalcPriorities,
    getQueueForGear,
    getReservationsForGear,
    getMyReservations,
    getReservationsByStatus,
    hasReservationForGear,
    getGearReservationCount,
    updateReservation
  };
}

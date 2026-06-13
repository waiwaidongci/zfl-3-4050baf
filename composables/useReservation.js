import { computed, ref } from 'vue';
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
  RESERVATION_STATUSES,
  validateActivation,
  createRequestFromReservation,
  analyzeAllActivatableReservations,
  skipReservation,
  unskipReservation,
  adjustReservationDates,
  batchActivateReservations,
  analyzeConflicts,
  findAlternativeDates
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
    if (!reservation) return { ok: false, errors: [{ code: 'not_found', message: '候补记录不存在' }], reservation: null, request: null };

    const validation = validateActivation(reservation, {
      requests: requestList.value,
      gears: gearList.value
    });

    if (!validation.ok) {
      return { ok: false, errors: validation.errors, reservation: null, request: null };
    }

    const gear = gearList.value.find((g) => g.id === reservation.gearId);
    const newRequest = createRequestFromReservation(reservation, gear);
    const updatedReservation = activateReservation(reservation, newRequest.id);

    return {
      ok: true,
      errors: [],
      reservation: updatedReservation,
      request: newRequest
    };
  }

  function checkAndActivate() {
    const expired = expireOutdatedReservations(reservationList.value);
    const withPriorities = recalcAllPriorities(expired, getContextForPriority());

    const activatable = findActivatableReservations(withPriorities, {
      requests: requestList.value,
      gears: gearList.value
    });

    const newRequests = [];
    const updated = withPriorities.map((r) => {
      if (activatable && r.id === activatable.id) {
        const gear = gearList.value.find((g) => g.id === r.gearId);
        const newRequest = createRequestFromReservation(r, gear);
        newRequests.push(newRequest);
        return activateReservation(r, newRequest.id);
      }
      return r;
    });

    const finalList = computeQueuePositions(updated);
    return {
      list: finalList,
      activated: activatable ? [activatable.id] : [],
      newRequests
    };
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

  const reviewMode = ref(false);
  const reviewItems = ref([]);

  function getReviewContext() {
    return {
      requests: requestList.value,
      gears: gearList.value,
      handovers: handoverList.value,
      healthInfoMap: healthMap.value
    };
  }

  function analyzeForReview() {
    const expired = expireOutdatedReservations(reservationList.value);
    const withPriorities = recalcAllPriorities(expired, getContextForPriority());
    const withPositions = computeQueuePositions(withPriorities);
    const context = getReviewContext();
    reviewItems.value = analyzeAllActivatableReservations(withPositions, context);
    return reviewItems.value;
  }

  function toggleReviewMode() {
    reviewMode.value = !reviewMode.value;
    if (reviewMode.value) {
      analyzeForReview();
    }
    return reviewMode.value;
  }

  function toggleSelectReviewItem(itemId) {
    reviewItems.value = reviewItems.value.map((item) =>
      item.id === itemId ? { ...item, selected: !item.selected } : item
    );
  }

  function selectAllReviewItems(canActivateOnly = true) {
    reviewItems.value = reviewItems.value.map((item) => ({
      ...item,
      selected: canActivateOnly ? item.canActivate : true
    }));
  }

  function clearSelection() {
    reviewItems.value = reviewItems.value.map((item) => ({
      ...item,
      selected: false
    }));
  }

  function setItemAction(itemId, action, notes = '') {
    reviewItems.value = reviewItems.value.map((item) =>
      item.id === itemId ? { ...item, action, reviewNotes: notes } : item
    );
  }

  function setItemAdjustedDates(itemId, start, end) {
    reviewItems.value = reviewItems.value.map((item) =>
      item.id === itemId
        ? {
            ...item,
            adjustedStart: start,
            adjustedEnd: end,
            action: 'adjust'
          }
        : item
    );
  }

  function doSkip(reservationId, notes = '') {
    const reservation = reservationList.value.find((r) => r.id === reservationId);
    if (!reservation) return null;
    return skipReservation(reservation, notes);
  }

  function doUnskip(reservationId) {
    const reservation = reservationList.value.find((r) => r.id === reservationId);
    if (!reservation) return null;
    return unskipReservation(reservation);
  }

  function doAdjustDates(reservationId, newStart, newEnd) {
    const reservation = reservationList.value.find((r) => r.id === reservationId);
    if (!reservation) return null;
    const updated = adjustReservationDates(reservation, newStart, newEnd);
    const ctx = getContextForPriority();
    updated.priorityScore = calculatePriorityScore(updated, ctx);
    return updated;
  }

  function batchProcessReview(action = 'confirm') {
    let itemsToProcess = [];
    const skippedItems = [];
    const adjustedItems = [];

    for (const item of reviewItems.value) {
      if (!item.selected) continue;

      const itemAction = item.action || action;

      if (itemAction === 'skip') {
        skippedItems.push(item);
      } else if (itemAction === 'adjust' && item.adjustedStart && item.adjustedEnd) {
        adjustedItems.push(item);
      } else if (itemAction === 'confirm' && item.canActivate) {
        itemsToProcess.push(item);
      }
    }

    const result = batchActivateReservations(
      itemsToProcess,
      {
        gears: gearList.value,
        requests: requestList.value
      },
      getReviewContext()
    );

    let updatedList = [...reservationList.value];

    for (const updated of result.updatedReservations) {
      updatedList = updatedList.map((r) => (r.id === updated.id ? updated : r));
    }

    for (const skipItem of skippedItems) {
      const skipped = skipReservation(skipItem.reservation, skipItem.reviewNotes);
      updatedList = updatedList.map((r) => (r.id === skipped.id ? skipped : r));
    }

    for (const adjItem of adjustedItems) {
      const adjusted = doAdjustDates(
        adjItem.reservation.id,
        adjItem.adjustedStart,
        adjItem.adjustedEnd
      );
      if (adjusted) {
        updatedList = updatedList.map((r) => (r.id === adjusted.id ? adjusted : r));
      }
    }

    const finalList = computeQueuePositions(updatedList);

    return {
      ...result,
      skippedCount: skippedItems.length,
      adjustedCount: adjustedItems.length,
      finalList
    };
  }

  function analyzeItemConflicts(reservationId) {
    const reservation = reservationList.value.find((r) => r.id === reservationId);
    if (!reservation) return null;
    return analyzeConflicts(reservation, {
      requests: requestList.value,
      gears: gearList.value,
      healthInfoMap: healthMap.value
    });
  }

  function findItemAlternativeDates(reservationId, daysToCheck = 30) {
    const reservation = reservationList.value.find((r) => r.id === reservationId);
    if (!reservation) return [];
    return findAlternativeDates(
      reservation,
      {
        requests: requestList.value,
        gears: gearList.value
      },
      daysToCheck
    );
  }

  function checkAndActivateWithReview() {
    const expired = expireOutdatedReservations(reservationList.value);
    const withPriorities = recalcAllPriorities(expired, getContextForPriority());

    const activatable = findActivatableReservations(withPriorities, {
      requests: requestList.value,
      gears: gearList.value
    });

    const reviewCandidates = analyzeAllActivatableReservations(withPriorities, getReviewContext());
    const needsReview = reviewCandidates.filter(
      (item) => !item.canActivate && item.warnings.length > 0 && !item.activationBlockers.length
    );

    reviewItems.value = reviewCandidates;

    const newRequests = [];
    let updated = withPriorities;

    if (activatable) {
      const gear = gearList.value.find((g) => g.id === activatable.gearId);
      const newRequest = createRequestFromReservation(activatable, gear);
      newRequests.push(newRequest);
      updated = updated.map((r) =>
        r.id === activatable.id ? activateReservation(r, newRequest.id) : r
      );
    }

    const finalList = computeQueuePositions(updated);

    return {
      list: finalList,
      activated: activatable ? [activatable.id] : [],
      newRequests,
      needsReview,
      reviewModeAvailable: needsReview.length > 0,
      allReviewItems: reviewCandidates
    };
  }

  function refreshReviewAnalysis() {
    return analyzeForReview();
  }

  return {
    reservationList,
    activeReservations,
    activatedReservations,
    stats,
    sortedQueue,
    reviewMode,
    reviewItems,
    addReservation,
    doCancel,
    doActivate,
    checkAndActivate,
    checkAndActivateWithReview,
    recalcPriorities,
    getQueueForGear,
    getReservationsForGear,
    getMyReservations,
    getReservationsByStatus,
    hasReservationForGear,
    getGearReservationCount,
    updateReservation,
    analyzeForReview,
    toggleReviewMode,
    toggleSelectReviewItem,
    selectAllReviewItems,
    clearSelection,
    setItemAction,
    setItemAdjustedDates,
    doSkip,
    doUnskip,
    doAdjustDates,
    batchProcessReview,
    analyzeItemConflicts,
    findItemAlternativeDates,
    refreshReviewAnalysis
  };
}

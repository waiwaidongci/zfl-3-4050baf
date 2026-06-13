import { computed } from 'vue';
import {
  createSettlement,
  linkDepositsToSettlement,
  calculateSettlement,
  addExtraExpense,
  updateExtraExpense,
  removeExtraExpense,
  updateMemberDepositDeduct,
  updateMemberPayment,
  updateMemberNotes,
  syncDepositChanges,
  getSettlementStats,
  SETTLEMENT_STATUSES,
  getSettlementWrapupStatus,
  refreshSettlementFromSources,
  markInventoryDeductionAsHandled,
  updateAllPaymentsToPaid,
  canFinalizeSettlement,
  finalizeSettlement
} from '../utils/settlementTransform.js';

function resolve(val) {
  if (val === null || val === undefined) return val;
  if (typeof val === 'object' && 'value' in val) return val.value;
  return val;
}

export function useSettlement({ settlementRecords, trips, members, depositRecords, gears, requests, inventoryLists }) {
  const records = computed(() => resolve(settlementRecords) || []);
  const tripList = computed(() => resolve(trips) || []);
  const memberList = computed(() => resolve(members) || []);
  const depositList = computed(() => resolve(depositRecords) || []);
  const requestList = computed(() => resolve(requests) || []);
  const inventoryList = computed(() => resolve(inventoryLists) || []);

  const settlementCount = computed(() => records.value.length);
  const draftCount = computed(() => records.value.filter((s) => s.status === '草稿').length);
  const confirmedCount = computed(() => records.value.filter((s) => s.status === '已确认').length);
  const settledCount = computed(() => records.value.filter((s) => s.status === '已结算').length);

  function getTripRequestIds(trip) {
    if (!trip) return [];
    const tripGearIds = new Set((trip.gears || []).map((g) => g.gearId).filter(Boolean));
    const tripMembers = new Set(trip.members || []);
    const tripDate = trip.startDate ? new Date(trip.startDate) : null;
    return requestList.value
      .filter((req) => {
        if (!tripGearIds.has(req.gearId)) return false;
        if (!tripMembers.has(req.borrower)) return false;
        if (!tripDate || !req.start || !req.end) return true;
        const start = new Date(req.start);
        const end = new Date(req.end);
        return tripDate >= start && tripDate <= end;
      })
      .map((req) => req.id);
  }

  function createForTrip(tripId) {
    const trip = tripList.value.find((t) => t.id === tripId);
    if (!trip) return null;
    const tripMembers = memberList.value.filter((m) => trip.members.includes(m.nickname));
    const tripGears = trip.gears || [];
    const tripRequestIds = getTripRequestIds(trip);
    const settlement = createSettlement({
      tripId: trip.id,
      tripName: trip.destination,
      members: tripMembers,
      name: `${trip.destination} 结算单`
    });
    const linked = linkDepositsToSettlement(settlement, depositList.value, trip.members, tripGears, tripRequestIds, inventoryList.value);
    return calculateSettlement(linked);
  }

  function createManual(name, selectedMemberIds) {
    const selectedMembers = memberList.value.filter((m) => selectedMemberIds.includes(m.id));
    const settlement = createSettlement({
      tripId: '',
      tripName: '',
      members: selectedMembers,
      name: name || '新结算单'
    });
    const memberNames = selectedMembers.map((m) => m.nickname);
    const linked = linkDepositsToSettlement(settlement, depositList.value, memberNames, [], null, inventoryList.value);
    return calculateSettlement(linked);
  }

  function addExpense(settlementId, expense) {
    const record = records.value.find((s) => s.id === settlementId);
    if (!record) return null;
    return addExtraExpense(record, expense);
  }

  function editExpense(settlementId, expenseId, updates) {
    const record = records.value.find((s) => s.id === settlementId);
    if (!record) return null;
    return updateExtraExpense(record, expenseId, updates);
  }

  function deleteExpense(settlementId, expenseId) {
    const record = records.value.find((s) => s.id === settlementId);
    if (!record) return null;
    return removeExtraExpense(record, expenseId);
  }

  function setMemberDeduct(settlementId, memberIndex, depositIndex, actualDeduct) {
    const record = records.value.find((s) => s.id === settlementId);
    if (!record) return null;
    return updateMemberDepositDeduct(record, memberIndex, depositIndex, actualDeduct);
  }

  function setMemberPayment(settlementId, memberIndex, paidAmount) {
    const record = records.value.find((s) => s.id === settlementId);
    if (!record) return null;
    return updateMemberPayment(record, memberIndex, paidAmount);
  }

  function setMemberNotes(settlementId, memberIndex, notes) {
    const record = records.value.find((s) => s.id === settlementId);
    if (!record) return null;
    return updateMemberNotes(record, memberIndex, notes);
  }

  function recalcSettlement(settlementId) {
    const record = records.value.find((s) => s.id === settlementId);
    if (!record) return null;
    return calculateSettlement({ ...record });
  }

  function refreshFromDeposits(settlementId) {
    const record = records.value.find((s) => s.id === settlementId);
    if (!record) return null;
    const trip = record.tripId ? tripList.value.find((t) => t.id === record.tripId) : null;
    const tripGears = trip ? (trip.gears || []) : [];
    const tripRequestIds = getTripRequestIds(trip);
    return syncDepositChanges(record, depositList.value, tripGears, tripRequestIds, inventoryList.value);
  }

  function getStats(settlementId) {
    const record = records.value.find((s) => s.id === settlementId);
    return getSettlementStats(record);
  }

  function getById(settlementId) {
    return records.value.find((s) => s.id === settlementId) || null;
  }

  function updateStatus(settlementId, newStatus) {
    const record = records.value.find((s) => s.id === settlementId);
    if (!record) return null;
    if (!SETTLEMENT_STATUSES.includes(newStatus)) return null;
    return { ...record, status: newStatus, updatedAt: new Date().toISOString().slice(0, 10) };
  }

  function updateInfo(settlementId, updates) {
    const record = records.value.find((s) => s.id === settlementId);
    if (!record) return null;
    return { ...record, ...updates, updatedAt: new Date().toISOString().slice(0, 10) };
  }

  function getWrapupStatus(settlementId) {
    const record = records.value.find((s) => s.id === settlementId);
    return getSettlementWrapupStatus(record);
  }

  function refreshFromAllSources(settlementId) {
    const record = records.value.find((s) => s.id === settlementId);
    if (!record) return null;
    const trip = record.tripId ? tripList.value.find((t) => t.id === record.tripId) : null;
    const tripGears = trip ? (trip.gears || []) : [];
    const tripRequestIds = getTripRequestIds(trip);
    return refreshSettlementFromSources(
      record,
      depositList.value,
      inventoryList.value,
      tripGears,
      tripRequestIds
    );
  }

  function handleInventoryDeduction(settlementId, inventoryActionId, shouldDeduct = true) {
    const record = records.value.find((s) => s.id === settlementId);
    if (!record) return null;
    return markInventoryDeductionAsHandled(record, inventoryActionId, shouldDeduct);
  }

  function markAllPaid(settlementId) {
    const record = records.value.find((s) => s.id === settlementId);
    if (!record) return null;
    return updateAllPaymentsToPaid(record);
  }

  function canFinalize(settlementId) {
    const record = records.value.find((s) => s.id === settlementId);
    return canFinalizeSettlement(record);
  }

  function finalize(settlementId) {
    const record = records.value.find((s) => s.id === settlementId);
    if (!record) return null;
    if (!canFinalizeSettlement(record)) return null;
    return finalizeSettlement(record);
  }

  function getByTripId(tripId) {
    return records.value.find((s) => s.tripId === tripId) || null;
  }

  function getOrCreateForTrip(tripId) {
    const existing = records.value.find((s) => s.tripId === tripId);
    if (existing) return existing;
    return createForTrip(tripId);
  }

  return {
    records,
    settlementCount,
    draftCount,
    confirmedCount,
    settledCount,
    createForTrip,
    createManual,
    addExpense,
    editExpense,
    deleteExpense,
    setMemberDeduct,
    setMemberPayment,
    setMemberNotes,
    recalcSettlement,
    refreshFromDeposits,
    getStats,
    getById,
    updateStatus,
    updateInfo,
    getWrapupStatus,
    refreshFromAllSources,
    handleInventoryDeduction,
    markAllPaid,
    canFinalize,
    finalize,
    getByTripId,
    getOrCreateForTrip
  };
}

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
  SETTLEMENT_STATUSES
} from '../utils/settlementTransform.js';

function resolve(val) {
  if (val === null || val === undefined) return val;
  if (typeof val === 'object' && 'value' in val) return val.value;
  return val;
}

export function useSettlement({ settlementRecords, trips, members, depositRecords, gears, requests }) {
  const records = computed(() => resolve(settlementRecords) || []);
  const tripList = computed(() => resolve(trips) || []);
  const memberList = computed(() => resolve(members) || []);
  const depositList = computed(() => resolve(depositRecords) || []);
  const gearList = computed(() => resolve(gears) || []);
  const requestList = computed(() => resolve(requests) || []);

  const settlementCount = computed(() => records.value.length);
  const draftCount = computed(() => records.value.filter((s) => s.status === '草稿').length);
  const confirmedCount = computed(() => records.value.filter((s) => s.status === '已确认').length);
  const settledCount = computed(() => records.value.filter((s) => s.status === '已结算').length);

  function createForTrip(tripId) {
    const trip = tripList.value.find((t) => t.id === tripId);
    if (!trip) return null;
    const tripMembers = memberList.value.filter((m) => trip.members.includes(m.nickname));
    const settlement = createSettlement({
      tripId: trip.id,
      tripName: trip.destination,
      members: tripMembers,
      name: `${trip.destination} 结算单`
    });
    const linked = linkDepositsToSettlement(settlement, depositList.value, trip.members);
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
    const linked = linkDepositsToSettlement(settlement, depositList.value, memberNames);
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
    return syncDepositChanges(record, depositList.value);
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
    updateInfo
  };
}

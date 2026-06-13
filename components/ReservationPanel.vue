<template>
  <div class="reservation-panel">
    <div v-if="reservation.reviewMode.value">
      <ReservationReviewPanel
        :review-items="reservation.reviewItems.value"
        :requests="requests"
        @toggle-select="reservation.toggleSelectReviewItem"
        @select-all="reservation.selectAllReviewItems"
        @clear-selection="reservation.clearSelection"
        @set-action="handleSetItemAction"
        @set-adjusted-dates="reservation.setItemAdjustedDates"
        @batch-process="handleBatchProcess"
        @refresh="reservation.analyzeForReview"
        @exit="handleExitReview"
        @view-timeline="(payload) => emit('view-timeline', payload)"
      />
    </div>

    <div v-else>
      <div class="review-entry-bar">
        <div class="review-entry-info">
          <span v-if="reviewableCount > 0" class="review-pending-badge">
            {{ reviewableCount }} 项候补可转正
          </span>
          <span v-if="stats.skipped > 0" class="review-skipped-badge">
            {{ stats.skipped }} 项已跳过
          </span>
        </div>
        <button class="review-entry-btn" @click="handleEnterReview">
          🔍 候补转正审核
        </button>
      </div>

      <section class="layout">
        <form class="panel" @submit.prevent="handleAddReservation">
          <h2>提交候补预约</h2>
          <label class="muted">选择装备</label>
          <select v-model="form.gearId" required>
            <option value="">请选择装备</option>
            <option v-for="gear in unavailableGears" :key="gear.id" :value="gear.id">
              {{ gear.name }}（{{ gear.owner }}）· {{ gear.status }}
            </option>
            <option v-for="gear in availableButOccupiedGears" :key="gear.id" :value="gear.id">
              {{ gear.name }}（{{ gear.owner }}）· 日期已被占用
            </option>
          </select>
          <label class="muted">借用人</label>
          <select v-model="form.borrower">
            <option v-for="member in members" :key="member.id">{{ member.nickname }}</option>
          </select>
          <label class="muted">期望借用日期</label>
          <div class="split">
            <input v-model="form.start" type="date" required />
            <input v-model="form.end" type="date" required />
          </div>
          <label class="muted">候补原因</label>
          <select v-model="form.reason">
            <option v-for="r in reservationReasons" :key="r">{{ r }}</option>
          </select>
          <label class="muted">备注</label>
          <textarea v-model="form.notes" placeholder="补充说明（可选）" rows="2"></textarea>
          <button type="submit">加入候补队列</button>
          <small class="muted">候补预约在装备可用时按顺位自动转正</small>
        </form>

        <div class="panel wide">
          <div class="toolbar">
            <h2>候补队列</h2>
            <div class="filter-group">
              <select v-model="statusFilter">
                <option v-for="opt in statusOptions" :key="opt">{{ opt }}</option>
              </select>
              <select v-model="gearFilter">
                <option v-for="opt in gearFilterOptions" :key="opt">{{ opt }}</option>
              </select>
            </div>
          </div>

          <div class="reservation-summary">
            <div class="summary-item">
              <span class="summary-label">候补中</span>
              <span class="summary-value active">{{ stats.active }}</span>
            </div>
            <div class="summary-item">
              <span class="summary-label">已转正</span>
              <span class="summary-value activated">{{ stats.activated }}</span>
            </div>
            <div class="summary-item">
              <span class="summary-label">已取消</span>
              <span class="summary-value cancelled">{{ stats.cancelled }}</span>
            </div>
            <div class="summary-item">
              <span class="summary-label">已过期</span>
              <span class="summary-value expired">{{ stats.expired }}</span>
            </div>
            <div v-if="stats.skipped > 0" class="summary-item">
              <span class="summary-label">已跳过</span>
              <span class="summary-value skipped">{{ stats.skipped }}</span>
            </div>
          </div>

          <div v-if="filteredReservations.length === 0" class="empty-state muted">
            当前筛选条件下暂无候补预约
          </div>
          <div v-else class="reservation-list">
            <article
              v-for="reservation in filteredReservations"
              :key="reservation.id"
              :class="['reservation-card', reservation.status]"
            >
              <div class="reservation-header">
                <div class="reservation-title-group">
                  <strong>{{ reservation.gearName }}</strong>
                  <span :class="['reservation-status-badge', reservation.status]">
                    {{ reservation.status }}
                  </span>
                </div>
                <div v-if="reservation.status === '候补中' || reservation.status === '审核跳过'" class="queue-position">
                  顺位 #{{ reservation.queuePosition || '-' }}
                </div>
              </div>
              <div class="reservation-meta">
                <span>装备主人：{{ reservation.owner }}</span>
                <span>借用人：{{ reservation.borrower }}</span>
                <span>期望日期：{{ reservation.start }} ~ {{ reservation.end }}</span>
              </div>
              <div class="reservation-details">
                <span class="reservation-reason">候补原因：{{ reservation.reason }}</span>
                <span class="priority-score">优先评分：{{ reservation.priorityScore }}</span>
              </div>
              <p v-if="reservation.notes" class="reservation-notes">备注：{{ reservation.notes }}</p>
              <p v-if="reservation.reviewNotes" class="reservation-notes review-notes">审核备注：{{ reservation.reviewNotes }}</p>
              <p v-if="reservation.activatedAt" class="activated-time">转正时间：{{ formatDate(reservation.activatedAt) }}</p>
              <div class="reservation-actions">
                <button
                  v-if="(reservation.status === '候补中' || reservation.status === '审核跳过') && reservation.borrower === currentUser"
                  class="ghost small danger"
                  @click="handleCancel(reservation.id)"
                >
                  取消候补
                </button>
                <button
                  v-if="reservation.status === '候补中'"
                  class="ghost small"
                  @click="handleManualActivate(reservation.id)"
                >
                  手动转正
                </button>
                <button
                  v-if="reservation.status === '审核跳过'"
                  class="ghost small"
                  @click="handleUnskip(reservation.id)"
                >
                  恢复候补
                </button>
                <button
                  class="ghost small"
                  @click="emit('view-timeline', { entityType: 'reservation', entityId: reservation.id, entityName: reservation.gearName || '' })"
                >
                  📋 时间线
                </button>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section class="panel gear-queue-section">
        <h2>装备候补队列详情</h2>
        <div v-if="gearQueueList.length === 0" class="empty-state muted">
          暂无装备存在候补预约
        </div>
        <div v-else class="gear-queue-list">
          <article v-for="gearQueue in gearQueueList" :key="gearQueue.gearId" class="gear-queue-card">
            <div class="gear-queue-header">
              <strong>{{ gearQueue.gearName }}</strong>
              <span class="muted">{{ gearQueue.owner }}</span>
              <span :class="['gear-status-tag', gearQueue.gearStatus]">{{ gearQueue.gearStatus }}</span>
              <span class="queue-count">{{ gearQueue.queue.length }} 人候补</span>
            </div>
            <div v-if="gearQueue.queue.length === 0" class="muted" style="padding: 8px 0;">
              暂无候补
            </div>
            <div v-else class="queue-items">
              <div v-for="(item, index) in gearQueue.queue" :key="item.id" class="queue-item">
                <span class="queue-rank">{{ index + 1 }}</span>
                <span class="queue-borrower">{{ item.borrower }}</span>
                <span class="queue-dates">{{ item.start }} ~ {{ item.end }}</span>
                <span class="queue-priority">评分 {{ item.priorityScore }}</span>
                <span :class="['queue-status-tag', item.status]">{{ item.status }}</span>
              </div>
            </div>
          </article>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, toRef } from 'vue';
import { useReservation } from '../composables/useReservation.js';
import { RESERVATION_REASONS } from '../utils/reservationTransform.js';
import ReservationReviewPanel from './ReservationReviewPanel.vue';

const props = defineProps({
  reservations: {
    type: Array,
    default: () => []
  },
  gears: {
    type: Array,
    default: () => []
  },
  requests: {
    type: Array,
    default: () => []
  },
  handovers: {
    type: Array,
    default: () => []
  },
  members: {
    type: Array,
    default: () => []
  },
  currentUser: {
    type: String,
    default: ''
  },
  healthInfoMap: {
    type: Object,
    default: () => ({})
  }
});

const emit = defineEmits(['update:reservations', 'create-request', 'log-event', 'view-timeline', 'enter-review-mode']);

const statusFilter = ref('全部状态');
const gearFilter = ref('全部装备');
const statusOptions = ['全部状态', '候补中', '审核跳过', '已转正', '已取消', '已过期'];
const reservationReasons = RESERVATION_REASONS;

const reviewableCount = computed(() =>
  props.reservations.filter(r =>
    (r.status === '候补中' || r.status === '审核跳过') &&
    !r.generatedRequestId
  ).length
);

const reservation = useReservation({
  reservations: toRef(props, 'reservations'),
  gears: toRef(props, 'gears'),
  requests: toRef(props, 'requests'),
  handovers: toRef(props, 'handovers'),
  members: toRef(props, 'members'),
  currentUser: toRef(props, 'currentUser'),
  healthInfoMap: toRef(props, 'healthInfoMap')
});

const form = ref({
  gearId: '',
  borrower: props.currentUser || '',
  start: '',
  end: '',
  reason: '装备借出中',
  notes: ''
});

watch(
  () => props.currentUser,
  (val) => {
    if (val && !form.value.borrower) {
      form.value.borrower = val;
    }
  },
  { immediate: true }
);

const stats = computed(() => reservation.stats.value);

const unavailableGears = computed(() =>
  props.gears.filter((g) => g.status === '借出中')
);

const availableButOccupiedGears = computed(() =>
  props.gears.filter((g) => {
    if (g.status !== '可借') return false;
    const hasConflict = props.requests.some(
      (r) => r.gearId === g.id && (r.status === '待处理' || r.status === '已同意')
    );
    return hasConflict;
  })
);

const gearFilterOptions = computed(() => [
  '全部装备',
  ...new Set(props.reservations.map((r) => r.gearName).filter(Boolean))
]);

const filteredReservations = computed(() => {
  return reservation.sortedQueue.value.filter((r) => {
    const sMatch = statusFilter.value === '全部状态' || r.status === statusFilter.value;
    const gMatch = gearFilter.value === '全部装备' || r.gearName === gearFilter.value;
    return sMatch && gMatch;
  });
});

const gearQueueList = computed(() => {
  const map = new Map();
  for (const r of reservation.sortedQueue.value) {
    if (r.status !== '候补中') continue;
    if (!map.has(r.gearId)) {
      const gear = props.gears.find((g) => g.id === r.gearId);
      map.set(r.gearId, {
        gearId: r.gearId,
        gearName: r.gearName,
        owner: r.owner,
        gearStatus: gear ? gear.status : '未知',
        queue: []
      });
    }
    map.get(r.gearId).queue.push(r);
  }
  return Array.from(map.values());
});

function updateReservations(newList) {
  emit('update:reservations', newList);
}

function handleAddReservation() {
  if (!form.value.gearId) {
    alert('请选择装备');
    return;
  }
  if (!form.value.start || !form.value.end) {
    alert('请选择借用日期');
    return;
  }
  if (new Date(form.value.end) < new Date(form.value.start)) {
    alert('归还日期不能早于借用日期');
    return;
  }

  const beforeState = null;
  const gear = props.gears.find((g) => g.id === form.value.gearId);

  const newRes = reservation.addReservation({
    gearId: form.value.gearId,
    borrower: form.value.borrower,
    start: form.value.start,
    end: form.value.end,
    reason: form.value.reason,
    notes: form.value.notes
  });

  if (newRes) {
    updateReservations([newRes, ...props.reservations]);
    emit('log-event', {
      entityType: 'reservation',
      entityId: newRes.id,
      entityName: `${gear ? gear.name : '未知装备'} - ${newRes.borrower}`,
      action: 'create',
      beforeState,
      afterState: newRes,
      sourcePage: '预约排程',
      relatedEntityType: 'gear',
      relatedEntityId: newRes.gearId,
      relatedEntityName: gear ? gear.name : ''
    });
    form.value = {
      gearId: '',
      borrower: props.currentUser || '',
      start: '',
      end: '',
      reason: '装备借出中',
      notes: ''
    };
  }
}

function handleCancel(reservationId) {
  if (!confirm('确定取消该候补预约吗？')) return;
  const target = props.reservations.find((r) => r.id === reservationId);
  const beforeState = target ? { ...target } : null;
  const gear = props.gears.find((g) => g.id === target?.gearId);
  const updated = reservation.doCancel(reservationId);
  if (updated) {
    updateReservations(props.reservations.map((r) => (r.id === reservationId ? updated : r)));
    emit('log-event', {
      entityType: 'reservation',
      entityId: reservationId,
      entityName: `${gear ? gear.name : '未知装备'} - ${target?.borrower || ''}`,
      action: 'cancel',
      beforeState,
      afterState: updated,
      sourcePage: '预约排程',
      relatedEntityType: 'gear',
      relatedEntityId: target?.gearId || '',
      relatedEntityName: gear ? gear.name : ''
    });
  }
}

function handleManualActivate(reservationId) {
  const target = props.reservations.find((r) => r.id === reservationId);
  const beforeState = target ? { ...target } : null;
  const gear = props.gears.find((g) => g.id === target?.gearId);
  const result = reservation.doActivate(reservationId);
  if (!result.ok) {
    const messages = result.errors.map((e) => e.message).join('\n');
    alert(`无法转正：\n${messages}`);
    return;
  }
  if (!confirm('确定将该候补预约手动转正吗？转正后将生成一条借用申请。')) return;
  if (result.reservation && result.request) {
    updateReservations(props.reservations.map((r) => (r.id === reservationId ? result.reservation : r)));
    emit('create-request', result.request);
    emit('log-event', {
      entityType: 'reservation',
      entityId: reservationId,
      entityName: `${gear ? gear.name : '未知装备'} - ${target?.borrower || ''}`,
      action: 'activate',
      beforeState,
      afterState: result.reservation,
      sourcePage: '预约排程',
      notes: '手动转正，已生成借用申请',
      relatedEntityType: 'request',
      relatedEntityId: result.request.id,
      relatedEntityName: result.request.gearName
    });
  }
}

function handleUnskip(reservationId) {
  const target = props.reservations.find((r) => r.id === reservationId);
  const beforeState = target ? { ...target } : null;
  const gear = props.gears.find((g) => g.id === target?.gearId);
  const updated = reservation.doUnskip(reservationId);
  if (updated) {
    updateReservations(props.reservations.map((r) => (r.id === reservationId ? updated : r)));
    emit('log-event', {
      entityType: 'reservation',
      entityId: reservationId,
      entityName: `${gear ? gear.name : '未知装备'} - ${target?.borrower || ''}`,
      action: 'unskip',
      beforeState,
      afterState: updated,
      sourcePage: '预约排程',
      notes: '恢复候补中状态',
      relatedEntityType: 'gear',
      relatedEntityId: target?.gearId || '',
      relatedEntityName: gear ? gear.name : ''
    });
  }
}

function handleEnterReview() {
  reservation.toggleReviewMode();
  reservation.analyzeForReview();
  emit('enter-review-mode');
  emit('log-event', {
    entityType: 'reservation',
    entityId: 'review_mode',
    entityName: '候补转正审核',
    action: 'enter_review',
    beforeState: null,
    afterState: { mode: 'review' },
    sourcePage: '预约排程',
    notes: '进入候补转正审核模式'
  });
}

function handleExitReview() {
  reservation.toggleReviewMode();
  emit('log-event', {
    entityType: 'reservation',
    entityId: 'review_mode',
    entityName: '候补转正审核',
    action: 'exit_review',
    beforeState: { mode: 'review' },
    afterState: { mode: 'normal' },
    sourcePage: '预约排程',
    notes: '退出候补转正审核模式'
  });
}

function handleSetItemAction(itemId, action, notes = '') {
  reservation.setItemAction(itemId, action, notes);
}

function handleBatchProcess() {
  const selectedItems = reservation.reviewItems.value.filter(i => i.selected);
  if (selectedItems.length === 0) {
    alert('请先选择要处理的项目');
    return;
  }

  const confirmCount = selectedItems.filter(i => (i.action === 'confirm' || !i.action) && i.canActivate).length;
  const skipCount = selectedItems.filter(i => i.action === 'skip').length;
  const adjustCount = selectedItems.filter(i => i.action === 'adjust' && i.adjustedStart).length;

  if (!confirm(`确定批量处理已选择的 ${selectedItems.length} 项？\n\n- ${confirmCount} 项将转正\n- ${skipCount} 项将跳过\n- ${adjustCount} 项将调整日期`)) {
    return;
  }

  const result = reservation.batchProcessReview();

  if (result.finalList) {
    updateReservations(result.finalList);
  }

  for (const req of result.newRequests || []) {
    emit('create-request', req);
  }

  for (const item of selectedItems) {
    const gear = props.gears.find((g) => g.id === item.reservation.gearId);
    const action = item.action || 'confirm';
    let actionName = '转正';
    if (action === 'skip') actionName = '跳过';
    if (action === 'adjust') actionName = '调整日期';

    emit('log-event', {
      entityType: 'reservation',
      entityId: item.reservation.id,
      entityName: `${gear ? gear.name : '未知装备'} - ${item.reservation.borrower}`,
      action: action === 'skip' ? 'skip' : (action === 'adjust' ? 'adjust_dates' : 'activate'),
      beforeState: { status: item.reservation.status },
      afterState: result.updatedReservations?.find(r => r.id === item.reservation.id) || { status: `已${actionName}` },
      sourcePage: '预约排程',
      notes: `审核批量处理 - ${actionName}`,
      relatedEntityType: action === 'confirm' ? 'request' : 'gear',
      relatedEntityId: action === 'confirm' && result.newRequests ? result.newRequests.find(r => r.fromReservationId === item.reservation.id)?.id : (item.reservation.gearId || ''),
      relatedEntityName: action === 'confirm' && result.newRequests ? result.newRequests.find(r => r.fromReservationId === item.reservation.id)?.gearName : (gear ? gear.name : '')
    });
  }

  const successCount = (result.successCount || 0) + (result.skippedCount || 0) + (result.adjustedCount || 0);
  if (successCount > 0) {
    setTimeout(() => {
      reservation.analyzeForReview();
    }, 100);
  }

  let msg = `批量处理完成：\n`;
  if (result.successCount > 0) msg += `- ${result.successCount} 项已转正\n`;
  if (result.skippedCount > 0) msg += `- ${result.skippedCount} 项已跳过\n`;
  if (result.adjustedCount > 0) msg += `- ${result.adjustedCount} 项已调整日期\n`;
  if (result.errors && result.errors.length > 0) {
    msg += `\n${result.errors.length} 项处理失败：\n`;
    result.errors.slice(0, 5).forEach(e => {
      msg += `- ${e.message || e.errors?.map(er => er.message).join(', ') || '未知错误'}\n`;
    });
    if (result.errors.length > 5) {
      msg += `... 还有 ${result.errors.length - 5} 条错误`;
    }
  }
  alert(msg);
}

function formatDate(isoStr) {
  if (!isoStr) return '';
  return new Date(isoStr).toLocaleString('zh-CN');
}
</script>

<style scoped>
.reservation-panel {
  width: 100%;
}

.layout {
  display: flex;
  gap: 20px;
  flex-wrap: wrap;
}

.panel {
  background: #fff;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  flex: 1;
  min-width: 300px;
}

.panel.wide {
  flex: 2;
  min-width: 400px;
}

.panel h2 {
  margin: 0 0 12px 0;
  color: #2f4a2c;
  font-size: 18px;
}

.panel label {
  display: block;
  font-size: 13px;
  color: #555;
  margin-bottom: 4px;
}

.panel input,
.panel select,
.panel textarea {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #d0d8c5;
  border-radius: 6px;
  font-size: 14px;
  margin-bottom: 12px;
  box-sizing: border-box;
  font-family: inherit;
}

.panel textarea {
  resize: vertical;
}

.panel button[type='submit'] {
  width: 100%;
  padding: 10px 16px;
  background: #2f4a2c;
  color: #fff;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: background 0.2s;
}

.panel button[type='submit']:hover {
  background: #3d5c37;
}

.muted {
  color: #888;
  font-size: 12px;
}

.split {
  display: flex;
  gap: 8px;
}

.split input {
  flex: 1;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  flex-wrap: wrap;
  gap: 8px;
}

.filter-group {
  display: flex;
  gap: 8px;
}

.filter-group select {
  padding: 6px 10px;
  border: 1px solid #d0d8c5;
  border-radius: 6px;
  font-size: 13px;
  background: #fff;
}

.reservation-summary {
  display: flex;
  gap: 16px;
  margin-bottom: 16px;
  padding: 12px 16px;
  background: #f5f8f0;
  border-radius: 8px;
}

.summary-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 60px;
}

.summary-label {
  font-size: 12px;
  color: #666;
  margin-bottom: 4px;
}

.summary-value {
  font-size: 20px;
  font-weight: 700;
}

.summary-value.active {
  color: #c58a2b;
}

.summary-value.activated {
  color: #2f7a3a;
}

.summary-value.cancelled {
  color: #999;
}

.summary-value.expired {
  color: #b02a2a;
}

.empty-state {
  padding: 40px 20px;
  text-align: center;
}

.reservation-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.reservation-card {
  background: #fafcf7;
  border: 1px solid #e2e8d8;
  border-radius: 10px;
  padding: 16px;
  transition: box-shadow 0.2s;
}

.reservation-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.reservation-card.已转正 {
  border-left: 4px solid #2f7a3a;
}

.reservation-card.候补中 {
  border-left: 4px solid #c58a2b;
}

.reservation-card.已取消 {
  border-left: 4px solid #999;
  opacity: 0.7;
}

.reservation-card.已过期 {
  border-left: 4px solid #b02a2a;
  opacity: 0.7;
}

.reservation-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.reservation-title-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.reservation-status-badge {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
}

.reservation-status-badge.候补中 {
  background: #fdf3e0;
  color: #8a6d1b;
}

.reservation-status-badge.已转正 {
  background: #e0f0e0;
  color: #2f7a3a;
}

.reservation-status-badge.已取消 {
  background: #f0f0f0;
  color: #666;
}

.reservation-status-badge.已过期 {
  background: #fde0d0;
  color: #b02a2a;
}

.queue-position {
  background: #2f4a2c;
  color: #fff;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
}

.reservation-meta {
  display: flex;
  gap: 12px;
  font-size: 13px;
  color: #555;
  margin-bottom: 6px;
  flex-wrap: wrap;
}

.reservation-details {
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: #777;
  margin-bottom: 4px;
}

.priority-score {
  background: #edf1e8;
  padding: 1px 6px;
  border-radius: 3px;
}

.reservation-notes {
  font-size: 12px;
  color: #666;
  margin: 4px 0;
}

.activated-time {
  font-size: 12px;
  color: #2f7a3a;
  margin: 4px 0;
}

.reservation-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.ghost {
  background: none;
  border: 1px solid #d0d8c5;
  cursor: pointer;
  border-radius: 6px;
  font-family: inherit;
  transition: all 0.2s;
}

.ghost:hover {
  background: #f0f4e8;
}

.ghost.small {
  padding: 4px 10px;
  font-size: 12px;
}

.ghost.danger {
  color: #b02a2a;
  border-color: #d4a0a0;
}

.ghost.danger:hover {
  background: #fdf0f0;
}

.gear-queue-section {
  margin-top: 20px;
  width: 100%;
  box-sizing: border-box;
}

.gear-queue-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.gear-queue-card {
  background: #f9fbf6;
  border: 1px solid #e2e8d8;
  border-radius: 10px;
  padding: 14px 16px;
}

.gear-queue-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}

.gear-status-tag {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
}

.gear-status-tag.可借 {
  background: #e0f0e0;
  color: #2f7a3a;
}

.gear-status-tag.借出中 {
  background: #fdf3e0;
  color: #8a6d1b;
}

.queue-count {
  margin-left: auto;
  font-size: 13px;
  color: #2f4a2c;
  font-weight: 500;
}

.queue-items {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.queue-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 10px;
  background: #fff;
  border-radius: 6px;
  font-size: 13px;
  border: 1px solid #eee;
}

.queue-rank {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #2f4a2c;
  color: #fff;
  border-radius: 50%;
  font-size: 12px;
  font-weight: 600;
  flex-shrink: 0;
}

.queue-borrower {
  font-weight: 500;
  min-width: 60px;
}

.queue-dates {
  color: #555;
  font-size: 12px;
}

.queue-priority {
  font-size: 11px;
  color: #888;
  background: #f0f4e8;
  padding: 1px 6px;
  border-radius: 3px;
}

.queue-status-tag {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 3px;
  margin-left: auto;
}

.queue-status-tag.候补中 {
  background: #fdf3e0;
  color: #8a6d1b;
}

@media (max-width: 768px) {
  .layout {
    flex-direction: column;
  }

  .panel,
  .panel.wide {
    min-width: 100%;
  }

  .reservation-meta {
    flex-direction: column;
    gap: 4px;
  }

  .reservation-details {
    flex-direction: column;
    gap: 4px;
  }

  .queue-item {
    flex-wrap: wrap;
  }
}

.review-entry-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: linear-gradient(135deg, #2f4a2c 0%, #3d5c37 100%);
  color: #fff;
  padding: 12px 20px;
  border-radius: 10px;
  margin-bottom: 20px;
  flex-wrap: wrap;
  gap: 12px;
}

.review-entry-info {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.review-pending-badge {
  background: rgba(255, 255, 255, 0.2);
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 500;
}

.review-skipped-badge {
  background: rgba(197, 138, 43, 0.3);
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 500;
}

.review-entry-btn {
  background: #fff;
  color: #2f4a2c;
  border: none;
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.review-entry-btn:hover {
  background: #f0f4e8;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.summary-value.skipped {
  color: #c58a2b;
}

.reservation-card.审核跳过 {
  border-left: 4px solid #c58a2b;
  opacity: 0.9;
}

.reservation-status-badge.审核跳过 {
  background: #fdf3e0;
  color: #8a6d1b;
}

.queue-status-tag.审核跳过 {
  background: #fdf3e0;
  color: #8a6d1b;
}

.review-notes {
  color: #8a6d1b !important;
  background: #fdf3e0;
  padding: 6px 10px;
  border-radius: 4px;
}

.queue-status-tag {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 3px;
  margin-left: auto;
}

.queue-status-tag.候补中 {
  background: #fdf3e0;
  color: #8a6d1b;
}
</style>

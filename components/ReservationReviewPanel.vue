<template>
  <div class="reservation-review-panel">
    <div class="review-header">
      <div class="review-title-group">
        <h2>候补转正审核工作台</h2>
        <span class="review-count-badge" v-if="reviewItems.length > 0">
          共 {{ reviewItems.length }} 项待处理
        </span>
      </div>
      <div class="review-actions">
        <button class="ghost small" @click="handleRefresh">
          🔄 刷新分析
        </button>
        <button class="ghost small" @click="handleExit">
          ✕ 退出审核
        </button>
      </div>
    </div>

    <div class="review-summary">
      <div class="summary-card can-activate">
        <span class="summary-label">可直接转正</span>
        <span class="summary-value">{{ canActivateCount }}</span>
      </div>
      <div class="summary-card has-warning">
        <span class="summary-label">存在警告</span>
        <span class="summary-value">{{ hasWarningCount }}</span>
      </div>
      <div class="summary-card blocked">
        <span class="summary-label">无法转正</span>
        <span class="summary-value">{{ blockedCount }}</span>
      </div>
      <div class="summary-card selected">
        <span class="summary-label">已选择</span>
        <span class="summary-value">{{ selectedCount }}</span>
      </div>
    </div>

    <div class="review-toolbar">
      <div class="filter-group">
        <select v-model="filterStatus">
          <option value="all">全部状态</option>
          <option value="canActivate">可转正</option>
          <option value="hasWarning">有警告</option>
          <option value="blocked">被阻止</option>
        </select>
        <select v-model="filterGear">
          <option value="all">全部装备</option>
          <option v-for="gear in gearOptions" :key="gear" :value="gear">{{ gear }}</option>
        </select>
      </div>
      <div class="action-group">
        <button class="ghost small" @click="selectAllCanActivate">
          ✓ 全选可转正
        </button>
        <button class="ghost small" @click="selectAll">
          ☐ 全选
        </button>
        <button class="ghost small" @click="clearSelection">
          ✕ 清除选择
        </button>
      </div>
    </div>

    <div v-if="filteredItems.length === 0" class="empty-state">
      <div class="empty-icon">✅</div>
      <p>当前筛选条件下没有待审核的候补预约</p>
      <button @click="handleRefresh">刷新分析</button>
    </div>

    <div v-else class="review-list">
      <div
        v-for="item in filteredItems"
        :key="item.id"
        :class="['review-card', {
          selected: item.selected,
          'can-activate': item.canActivate,
          'has-warning': item.warnings.length > 0 && item.canActivate,
          blocked: item.activationBlockers.length > 0
        }]"
      >
        <div class="review-card-header">
          <div class="card-selector">
            <input
              type="checkbox"
              :checked="item.selected"
              :disabled="item.activationBlockers.length > 0"
              @change="toggleSelect(item.id)"
            />
          </div>
          <div class="card-main-info">
            <div class="gear-title">
              <strong>{{ item.reservation.gearName }}</strong>
              <span class="gear-owner muted">· {{ item.reservation.owner }}</span>
              <span :class="['status-badge', item.canActivate ? 'ok' : (item.activationBlockers.length > 0 ? 'error' : 'warning')]">
                {{ item.canActivate ? '可转正' : (item.activationBlockers.length > 0 ? '无法转正' : '需注意') }}
              </span>
            </div>
            <div class="borrower-info">
              <span>借用人：{{ item.reservation.borrower }}</span>
              <span class="date-range">
                期望日期：<span :class="{ 'date-adjusted': item.adjustedStart }">
                  {{ formatDateRange(item.adjustedStart || item.reservation.start, item.adjustedEnd || item.reservation.end) }}
                </span>
                <span v-if="item.adjustedStart" class="original-date muted">
                  (原：{{ formatDateRange(item.reservation.start, item.reservation.end) }})
                </span>
              </span>
            </div>
          </div>
          <div class="priority-info">
            <div class="priority-score">
              <span class="score-label">优先级</span>
              <span class="score-value" :class="getPriorityClass(item.priorityScore)">
                {{ item.priorityScore }}
              </span>
            </div>
            <div class="queue-position">
              顺位 #{{ item.queuePosition || '-' }}
            </div>
          </div>
        </div>

        <div class="review-card-body">
          <div v-if="item.activationBlockers.length > 0" class="blockers-section">
            <div class="section-title">
              <span class="blocker-icon">🚫</span>
              <strong>无法转正原因</strong>
            </div>
            <div class="conflict-list">
              <div v-for="(conflict, idx) in item.activationBlockers" :key="idx" :class="['conflict-item', conflict.severity]">
                <span class="conflict-icon">{{ getConflictIcon(conflict.type) }}</span>
                <span class="conflict-message">{{ conflict.message }}</span>
              </div>
            </div>
          </div>

          <div v-if="item.warnings.length > 0" class="warnings-section">
            <div class="section-title">
              <span class="warning-icon">⚠️</span>
              <strong>注意事项</strong>
            </div>
            <div class="conflict-list">
              <div v-for="(warning, idx) in item.warnings" :key="idx" :class="['conflict-item', warning.severity]">
                <span class="conflict-icon">{{ getConflictIcon(warning.type) }}</span>
                <div class="conflict-content">
                  <span class="conflict-message">{{ warning.message }}</span>
                  <div v-if="warning.details?.conflictingRequests" class="conflict-details">
                    <div v-for="req in warning.details.conflictingRequests" :key="req.id" class="conflict-request">
                      <span>{{ req.borrower }}</span>
                      <span class="muted">{{ req.start }} ~ {{ req.end }}</span>
                      <span :class="['req-status', req.status]">{{ req.status }}</span>
                    </div>
                  </div>
                  <div v-if="warning.details?.risks" class="risk-details">
                    <span v-for="(risk, ridx) in warning.details.risks" :key="ridx" class="risk-tag">
                      {{ risk }}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="details-grid">
            <div class="detail-section priority-breakdown">
              <div class="section-title">
                <span>📊</span>
                <strong>优先评分来源</strong>
              </div>
              <div class="priority-factors">
                <div
                  v-for="factor in item.priorityBreakdown.breakdown"
                  :key="factor.key"
                  class="factor-item"
                >
                  <div class="factor-header">
                    <span class="factor-label">{{ factor.label }}</span>
                    <span class="factor-score">
                      {{ factor.score > 0 ? '+' : '' }}{{ factor.score }} / {{ factor.maxScore }}
                    </span>
                  </div>
                  <div class="factor-bar">
                    <div
                      class="factor-fill"
                      :class="{ positive: factor.score > 0, negative: factor.score < 0 }"
                      :style="{ width: getFactorBarWidth(factor.score, factor.maxScore) }"
                    ></div>
                  </div>
                  <div class="factor-reason muted">{{ factor.reason }}</div>
                </div>
              </div>
            </div>

            <div class="detail-section health-risks">
              <div class="section-title">
                <span>🏥</span>
                <strong>装备健康风险</strong>
              </div>
              <div v-if="item.healthRisks.risks.length === 0" class="no-risks">
                <span class="good-icon">✅</span>
                <span>装备状态良好，无明显风险</span>
                <span class="health-score good">健康分 {{ item.healthRisks.healthScore }}</span>
              </div>
              <div v-else class="risk-list">
                <div class="overall-health" :class="item.healthRisks.overallLevel">
                  <span>综合风险：{{ getRiskLevelLabel(item.healthRisks.overallLevel) }}</span>
                  <span class="health-score" :class="item.healthRisks.overallLevel">
                    {{ item.healthRisks.healthScore }} 分
                  </span>
                </div>
                <div
                  v-for="(risk, ridx) in item.healthRisks.risks"
                  :key="ridx"
                  :class="['risk-item', risk.level]"
                >
                  <span class="risk-icon">{{ getRiskIcon(risk.type) }}</span>
                  <div class="risk-content">
                    <span class="risk-label">{{ risk.label }}</span>
                    <span class="risk-desc muted">{{ risk.description }}</span>
                  </div>
                </div>
              </div>
            </div>

            <div class="detail-section occupancy">
              <div class="section-title">
                <span>📅</span>
                <strong>占用情况</strong>
              </div>
              <div v-if="item.occupancy.currentRequest" class="current-occupancy">
                <div class="occupancy-title">
                  <span class="occupancy-icon">🔄</span>
                  <strong>当前借出中</strong>
                </div>
                <div class="occupancy-details">
                  <span>借用人：{{ item.occupancy.currentRequest.borrower }}</span>
                  <span>日期：{{ item.occupancy.currentRequest.start }} ~ {{ item.occupancy.currentRequest.end }}</span>
                  <span :class="['req-status', item.occupancy.currentRequest.status]">
                    {{ item.occupancy.currentRequest.status }}
                  </span>
                </div>
              </div>
              <div v-if="item.occupancy.otherReservations.length > 0" class="other-reservations">
                <div class="occupancy-title">
                  <span class="occupancy-icon">📝</span>
                  <strong>其他候补（{{ item.occupancy.otherReservations.length }} 人）</strong>
                </div>
                <div class="other-res-list">
                  <div
                    v-for="(other, oidx) in item.occupancy.otherReservations.slice(0, 3)"
                    :key="other.id"
                    class="other-res-item"
                  >
                    <span>{{ other.borrower }}</span>
                    <span class="muted">{{ other.start }} ~ {{ other.end }}</span>
                    <span class="priority-badge">{{ other.priorityScore }}分</span>
                  </div>
                  <div v-if="item.occupancy.otherReservations.length > 3" class="more-res muted">
                    还有 {{ item.occupancy.otherReservations.length - 3 }} 人候补...
                  </div>
                </div>
              </div>
              <div v-if="!item.occupancy.currentRequest && item.occupancy.otherReservations.length === 0" class="no-occupancy">
                <span>当前无占用，装备可借</span>
              </div>
            </div>

            <div v-if="item.alternativeDates.length > 0" class="detail-section alternative-dates">
              <div class="section-title">
                <span>🔄</span>
                <strong>推荐备选日期</strong>
              </div>
              <div class="alt-dates-list">
                <div
                  v-for="(alt, aidx) in item.alternativeDates"
                  :key="aidx"
                  :class="['alt-date-item', { selected: item.adjustedStart === alt.start && item.adjustedEnd === alt.end }]"
                  @click="selectAlternativeDate(item.id, alt.start, alt.end)"
                >
                  <span class="alt-date-range">{{ formatDateRange(alt.start, alt.end) }}</span>
                  <span class="alt-date-offset" v-if="alt.daysFromOriginal !== 0">
                    {{ alt.daysFromOriginal > 0 ? '+' : '' }}{{ alt.daysFromOriginal }} 天
                  </span>
                  <span v-if="item.adjustedStart === alt.start && item.adjustedEnd === alt.end" class="selected-check">✓</span>
                </div>
              </div>
            </div>
          </div>

          <div class="review-card-footer">
            <div class="item-actions">
              <button
                class="ghost small"
                :class="{ active: item.action === 'confirm' }"
                @click="setAction(item.id, 'confirm')"
                :disabled="item.activationBlockers.length > 0"
              >
                ✓ 确认转正
              </button>
              <button
                class="ghost small"
                :class="{ active: item.action === 'skip' }"
                @click="setAction(item.id, 'skip')"
              >
                ⏭ 跳过
              </button>
              <button
                v-if="item.alternativeDates.length > 0"
                class="ghost small"
                :class="{ active: item.action === 'adjust' }"
                @click="showDateAdjuster(item)"
              >
                📅 调整日期
              </button>
            </div>
            <div class="action-badge" v-if="item.action">
              <span :class="['action-tag', item.action]">
                {{ getActionLabel(item.action) }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="selectedCount > 0" class="batch-actions-bar">
      <div class="batch-info">
        <span>已选择 {{ selectedCount }} 项</span>
        <span v-if="confirmCount > 0" class="batch-count confirm">
          {{ confirmCount }} 项将转正
        </span>
        <span v-if="skipCount > 0" class="batch-count skip">
          {{ skipCount }} 项将跳过
        </span>
        <span v-if="adjustCount > 0" class="batch-count adjust">
          {{ adjustCount }} 项将调整日期
        </span>
      </div>
      <div class="batch-buttons">
        <button class="ghost" @click="clearSelection">取消</button>
        <button class="primary" @click="handleBatchProcess">
          批量处理
        </button>
      </div>
    </div>

    <div v-if="showDateAdjustModal" class="modal-overlay" @click.self="closeDateAdjuster">
      <div class="modal-content date-adjust-modal">
        <div class="modal-header">
          <h3>调整借用日期</h3>
          <button class="close-btn" @click="closeDateAdjuster">✕</button>
        </div>
        <div class="modal-body">
          <div class="date-adjust-gear" v-if="currentAdjustItem">
            <strong>{{ currentAdjustItem.reservation.gearName }}</strong>
            <span class="muted">· {{ currentAdjustItem.reservation.borrower }}</span>
          </div>
          <div class="date-adjust-original" v-if="currentAdjustItem">
            <span class="muted">原日期：{{ formatDateRange(currentAdjustItem.reservation.start, currentAdjustItem.reservation.end) }}</span>
          </div>
          <div class="date-inputs">
            <label>
              新开始日期
              <input v-model="adjustStartDate" type="date" />
            </label>
            <label>
              新结束日期
              <input v-model="adjustEndDate" type="date" />
            </label>
          </div>
          <div v-if="conflictsForAdjust > 0" class="conflict-warning">
            ⚠️ 所选日期仍有 {{ conflictsForAdjust }} 条冲突记录
          </div>
          <div v-if="currentAdjustItem?.alternativeDates.length > 0" class="recommended-dates">
            <div class="section-title small">推荐日期（无冲突）</div>
            <div class="alt-dates-list">
              <div
                v-for="(alt, aidx) in currentAdjustItem.alternativeDates"
                :key="aidx"
                :class="['alt-date-item', { selected: adjustStartDate === alt.start && adjustEndDate === alt.end }]"
                @click="selectAltForModal(alt.start, alt.end)"
              >
                <span>{{ formatDateRange(alt.start, alt.end) }}</span>
                <span class="alt-date-offset">{{ alt.daysFromOriginal > 0 ? '+' : '' }}{{ alt.daysFromOriginal }} 天</span>
              </div>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="ghost" @click="closeDateAdjuster">取消</button>
          <button class="primary" @click="confirmDateAdjust" :disabled="!adjustStartDate || !adjustEndDate || conflictsForAdjust > 0">
            确认调整
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';

const props = defineProps({
  reviewItems: {
    type: Array,
    default: () => []
  },
  requests: {
    type: Array,
    default: () => []
  }
});

const emit = defineEmits([
  'toggle-select',
  'select-all',
  'clear-selection',
  'set-action',
  'set-adjusted-dates',
  'batch-process',
  'refresh',
  'exit',
  'view-timeline'
]);

const filterStatus = ref('all');
const filterGear = ref('all');

const showDateAdjustModal = ref(false);
const currentAdjustItem = ref(null);
const adjustStartDate = ref('');
const adjustEndDate = ref('');

const gearOptions = computed(() => {
  const gears = new Set(props.reviewItems.map(item => item.reservation.gearName));
  return Array.from(gears);
});

const filteredItems = computed(() => {
  return props.reviewItems.filter(item => {
    const statusMatch = filterStatus.value === 'all' ||
      (filterStatus.value === 'canActivate' && item.canActivate) ||
      (filterStatus.value === 'hasWarning' && item.warnings.length > 0 && !item.activationBlockers.length) ||
      (filterStatus.value === 'blocked' && item.activationBlockers.length > 0);
    const gearMatch = filterGear.value === 'all' || item.reservation.gearName === filterGear.value;
    return statusMatch && gearMatch;
  });
});

const canActivateCount = computed(() =>
  props.reviewItems.filter(item => item.canActivate).length
);

const hasWarningCount = computed(() =>
  props.reviewItems.filter(item => item.warnings.length > 0 && item.canActivate).length
);

const blockedCount = computed(() =>
  props.reviewItems.filter(item => item.activationBlockers.length > 0).length
);

const selectedCount = computed(() =>
  props.reviewItems.filter(item => item.selected).length
);

const confirmCount = computed(() =>
  props.reviewItems.filter(item => item.selected && (item.action === 'confirm' || !item.action) && item.canActivate).length
);

const skipCount = computed(() =>
  props.reviewItems.filter(item => item.selected && item.action === 'skip').length
);

const adjustCount = computed(() =>
  props.reviewItems.filter(item => item.selected && item.action === 'adjust' && item.adjustedStart).length
);

const conflictsForAdjust = computed(() => {
  if (!adjustStartDate.value || !adjustEndDate.value) return 0;
  if (!currentAdjustItem.value) return 0;

  const gearId = currentAdjustItem.value.reservation.gearId;
  const start = new Date(adjustStartDate.value);
  const end = new Date(adjustEndDate.value);

  return props.requests.filter(req => {
    if (req.gearId !== gearId) return false;
    if (req.status === '已拒绝' || req.status === '已归还') return false;
    if (req.id === currentAdjustItem.value.reservation.requestId) return false;
    const reqStart = new Date(req.start);
    const reqEnd = new Date(req.end);
    return start <= reqEnd && end >= reqStart;
  }).length;
});

function formatDateRange(start, end) {
  return `${start} ~ ${end}`;
}

function getPriorityClass(score) {
  if (score >= 80) return 'high';
  if (score >= 50) return 'medium';
  return 'low';
}

function getConflictIcon(type) {
  const icons = {
    date: '📅',
    gearStatus: '⚙️',
    healthRisk: '🏥',
    alreadyHasRequest: '📝',
    expired: '⏰'
  };
  return icons[type] || '⚠️';
}

function getRiskIcon(type) {
  const icons = {
    damage: '💥',
    maintenance: '🔧',
    deposit: '💰'
  };
  return icons[type] || '⚠️';
}

function getRiskLevelLabel(level) {
  const labels = {
    good: '良好',
    info: '提示',
    warning: '警告',
    danger: '危险'
  };
  return labels[level] || '未知';
}

function getFactorBarWidth(score, maxScore) {
  const percentage = maxScore > 0 ? (Math.abs(score) / maxScore) * 100 : 0;
  return `${Math.min(100, percentage)}%`;
}

function getActionLabel(action) {
  const labels = {
    confirm: '确认转正',
    skip: '跳过',
    adjust: '调整日期'
  };
  return labels[action] || action;
}

function toggleSelect(itemId) {
  emit('toggle-select', itemId);
}

function selectAllCanActivate() {
  emit('select-all', true);
}

function selectAll() {
  emit('select-all', false);
}

function clearSelection() {
  emit('clear-selection');
}

function setAction(itemId, action) {
  const item = props.reviewItems.find(i => i.id === itemId);
  if (!item) return;
  if (item.selected) {
    emit('set-action', itemId, action);
  } else {
    emit('toggle-select', itemId);
    emit('set-action', itemId, action);
  }
}

function selectAlternativeDate(itemId, start, end) {
  emit('set-adjusted-dates', itemId, start, end);
}

function showDateAdjuster(item) {
  currentAdjustItem.value = item;
  adjustStartDate.value = item.adjustedStart || item.reservation.start;
  adjustEndDate.value = item.adjustedEnd || item.reservation.end;
  showDateAdjustModal.value = true;
}

function closeDateAdjuster() {
  showDateAdjustModal.value = false;
  currentAdjustItem.value = null;
  adjustStartDate.value = '';
  adjustEndDate.value = '';
}

function selectAltForModal(start, end) {
  adjustStartDate.value = start;
  adjustEndDate.value = end;
}

function confirmDateAdjust() {
  if (currentAdjustItem.value && adjustStartDate.value && adjustEndDate.value) {
    if (new Date(adjustEndDate.value) < new Date(adjustStartDate.value)) {
      alert('归还日期不能早于借用日期');
      return;
    }
    emit('set-adjusted-dates', currentAdjustItem.value.id, adjustStartDate.value, adjustEndDate.value);
    if (!currentAdjustItem.value.selected) {
      emit('toggle-select', currentAdjustItem.value.id);
    }
    closeDateAdjuster();
  }
}

function handleBatchProcess() {
  emit('batch-process');
}

function handleRefresh() {
  emit('refresh');
}

function handleExit() {
  emit('exit');
}
</script>

<style scoped>
.reservation-review-panel {
  width: 100%;
}

.review-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  flex-wrap: wrap;
  gap: 12px;
}

.review-title-group {
  display: flex;
  align-items: center;
  gap: 12px;
}

.review-title-group h2 {
  margin: 0;
  color: #2f4a2c;
  font-size: 20px;
}

.review-count-badge {
  background: #2f4a2c;
  color: #fff;
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 500;
}

.review-actions {
  display: flex;
  gap: 8px;
}

.review-summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}

.summary-card {
  background: #fff;
  padding: 16px;
  border-radius: 10px;
  text-align: center;
  border: 1px solid #e2e8d8;
}

.summary-card.can-activate {
  border-left: 4px solid #2f7a3a;
}

.summary-card.has-warning {
  border-left: 4px solid #c58a2b;
}

.summary-card.blocked {
  border-left: 4px solid #b02a2a;
}

.summary-card.selected {
  border-left: 4px solid #2f4a2c;
}

.summary-label {
  display: block;
  font-size: 13px;
  color: #666;
  margin-bottom: 4px;
}

.summary-value {
  display: block;
  font-size: 28px;
  font-weight: 700;
  color: #2f4a2c;
}

.review-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  flex-wrap: wrap;
  gap: 12px;
}

.filter-group,
.action-group {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.filter-group select,
.action-group button {
  padding: 6px 12px;
  border: 1px solid #d0d8c5;
  border-radius: 6px;
  font-size: 13px;
  background: #fff;
  cursor: pointer;
}

.action-group button:hover {
  background: #f0f4e8;
}

.empty-state {
  text-align: center;
  padding: 60px 20px;
  background: #fff;
  border-radius: 10px;
  border: 1px solid #e2e8d8;
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 12px;
}

.empty-state p {
  color: #666;
  margin-bottom: 16px;
}

.empty-state button {
  padding: 8px 20px;
  background: #2f4a2c;
  color: #fff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}

.review-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.review-card {
  background: #fff;
  border: 1px solid #e2e8d8;
  border-radius: 12px;
  overflow: hidden;
  transition: all 0.2s;
}

.review-card.selected {
  border-color: #2f4a2c;
  box-shadow: 0 0 0 2px rgba(47, 74, 44, 0.2);
}

.review-card.can-activate {
  border-left: 4px solid #2f7a3a;
}

.review-card.has-warning {
  border-left: 4px solid #c58a2b;
}

.review-card.blocked {
  border-left: 4px solid #b02a2a;
  opacity: 0.85;
}

.review-card-header {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px;
  background: #fafcf7;
  border-bottom: 1px solid #e2e8d8;
}

.card-selector {
  padding-top: 4px;
}

.card-selector input[type="checkbox"] {
  width: 18px;
  height: 18px;
  cursor: pointer;
}

.card-main-info {
  flex: 1;
}

.gear-title {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 6px;
}

.gear-title strong {
  font-size: 16px;
  color: #2f4a2c;
}

.gear-owner {
  font-size: 13px;
}

.status-badge {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
}

.status-badge.ok {
  background: #e0f0e0;
  color: #2f7a3a;
}

.status-badge.warning {
  background: #fdf3e0;
  color: #8a6d1b;
}

.status-badge.error {
  background: #fde0d0;
  color: #b02a2a;
}

.borrower-info {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  font-size: 13px;
  color: #555;
}

.date-range {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.date-adjusted {
  color: #2f7a3a;
  font-weight: 500;
}

.original-date {
  text-decoration: line-through;
}

.priority-info {
  text-align: right;
  min-width: 100px;
}

.priority-score {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  margin-bottom: 4px;
}

.score-label {
  font-size: 11px;
  color: #888;
}

.score-value {
  font-size: 24px;
  font-weight: 700;
}

.score-value.high {
  color: #2f7a3a;
}

.score-value.medium {
  color: #c58a2b;
}

.score-value.low {
  color: #b02a2a;
}

.queue-position {
  font-size: 12px;
  color: #666;
  background: #edf1e8;
  padding: 2px 8px;
  border-radius: 4px;
  display: inline-block;
}

.review-card-body {
  padding: 16px;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  margin-bottom: 8px;
  color: #333;
}

.section-title.small {
  font-size: 13px;
  margin-top: 12px;
}

.blockers-section,
.warnings-section {
  margin-bottom: 16px;
  padding: 12px;
  border-radius: 8px;
}

.blockers-section {
  background: #fdf0f0;
}

.warnings-section {
  background: #fdf8e8;
}

.blocker-icon,
.warning-icon {
  font-size: 16px;
}

.conflict-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.conflict-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 12px;
  background: #fff;
  border-radius: 6px;
  border-left: 3px solid transparent;
}

.conflict-item.critical {
  border-left-color: #b02a2a;
}

.conflict-item.warning {
  border-left-color: #c58a2b;
}

.conflict-item.info {
  border-left-color: #2c5a8a;
}

.conflict-icon {
  font-size: 16px;
  flex-shrink: 0;
}

.conflict-content {
  flex: 1;
}

.conflict-message {
  font-size: 13px;
  color: #333;
}

.conflict-details {
  margin-top: 6px;
}

.conflict-request {
  display: flex;
  gap: 8px;
  font-size: 12px;
  padding: 4px 0;
  border-top: 1px dashed #eee;
}

.conflict-request:first-child {
  border-top: none;
}

.req-status {
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 11px;
  background: #f0f0f0;
}

.req-status.待处理 {
  background: #fdf3e0;
  color: #8a6d1b;
}

.req-status.已同意 {
  background: #e0f0e0;
  color: #2f7a3a;
}

.req-status.借出中 {
  background: #e8f0e0;
  color: #3a5a2a;
}

.risk-details {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 6px;
}

.risk-tag {
  padding: 2px 6px;
  background: #fff3e0;
  border-radius: 3px;
  font-size: 11px;
  color: #8a6d1b;
}

.details-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 16px;
  margin-bottom: 16px;
}

.detail-section {
  background: #fafcf7;
  padding: 12px;
  border-radius: 8px;
}

.priority-factors {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.factor-item {
  padding: 8px;
  background: #fff;
  border-radius: 6px;
}

.factor-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 4px;
  font-size: 13px;
}

.factor-label {
  color: #333;
  font-weight: 500;
}

.factor-score {
  font-weight: 600;
  color: #2f7a3a;
}

.factor-score.positive {
  color: #2f7a3a;
}

.factor-score.negative {
  color: #b02a2a;
}

.factor-bar {
  height: 6px;
  background: #eee;
  border-radius: 3px;
  overflow: hidden;
  margin-bottom: 4px;
}

.factor-fill {
  height: 100%;
  transition: width 0.3s;
}

.factor-fill.positive {
  background: #2f7a3a;
}

.factor-fill.negative {
  background: #b02a2a;
}

.factor-reason {
  font-size: 11px;
}

.no-risks {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 12px;
}

.good-icon {
  font-size: 24px;
}

.health-score {
  font-size: 12px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 10px;
}

.health-score.good {
  background: #e0f0e0;
  color: #2f7a3a;
}

.health-score.info {
  background: #e0e8f0;
  color: #2c5a8a;
}

.health-score.warning {
  background: #fdf3e0;
  color: #8a6d1b;
}

.health-score.danger {
  background: #fde0d0;
  color: #b02a2a;
}

.overall-health {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  margin-bottom: 8px;
  border-radius: 6px;
  font-weight: 500;
}

.overall-health.good {
  background: #e0f0e0;
  color: #2f7a3a;
}

.overall-health.info {
  background: #e0e8f0;
  color: #2c5a8a;
}

.overall-health.warning {
  background: #fdf3e0;
  color: #8a6d1b;
}

.overall-health.danger {
  background: #fde0d0;
  color: #b02a2a;
}

.risk-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.risk-item {
  display: flex;
  gap: 8px;
  padding: 6px 10px;
  background: #fff;
  border-radius: 6px;
  border-left: 3px solid transparent;
}

.risk-item.info {
  border-left-color: #2c5a8a;
}

.risk-item.warning {
  border-left-color: #c58a2b;
}

.risk-item.danger {
  border-left-color: #b02a2a;
}

.risk-icon {
  font-size: 14px;
  flex-shrink: 0;
}

.risk-content {
  display: flex;
  flex-direction: column;
}

.risk-label {
  font-size: 12px;
  font-weight: 500;
  color: #333;
}

.risk-desc {
  font-size: 11px;
}

.current-occupancy,
.other-reservations {
  margin-bottom: 10px;
  padding: 8px;
  background: #fff;
  border-radius: 6px;
}

.occupancy-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 500;
  margin-bottom: 6px;
  color: #333;
}

.occupancy-details {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12px;
  color: #555;
  margin-left: 22px;
}

.other-res-list {
  margin-left: 22px;
}

.other-res-item {
  display: flex;
  gap: 8px;
  font-size: 12px;
  padding: 3px 0;
}

.priority-badge {
  background: #edf1e8;
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 11px;
  color: #666;
}

.more-res {
  font-size: 11px;
  padding: 3px 0;
}

.no-occupancy {
  text-align: center;
  padding: 12px;
  color: #2f7a3a;
  font-size: 13px;
}

.alt-dates-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.alt-date-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: #fff;
  border: 1px solid #e2e8d8;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 13px;
}

.alt-date-item:hover {
  background: #f0f4e8;
  border-color: #2f4a2c;
}

.alt-date-item.selected {
  background: #e0f0e0;
  border-color: #2f7a3a;
}

.alt-date-range {
  font-weight: 500;
}

.alt-date-offset {
  color: #666;
  font-size: 12px;
}

.selected-check {
  color: #2f7a3a;
  font-weight: 700;
}

.review-card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 12px;
  border-top: 1px solid #e2e8d8;
  flex-wrap: wrap;
  gap: 12px;
}

.item-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.item-actions button {
  padding: 6px 12px;
  border: 1px solid #d0d8c5;
  background: #fff;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s;
}

.item-actions button:hover:not(:disabled) {
  background: #f0f4e8;
}

.item-actions button.active {
  background: #2f4a2c;
  color: #fff;
  border-color: #2f4a2c;
}

.item-actions button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.action-tag {
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
}

.action-tag.confirm {
  background: #e0f0e0;
  color: #2f7a3a;
}

.action-tag.skip {
  background: #f0f0f0;
  color: #666;
}

.action-tag.adjust {
  background: #e0e8f0;
  color: #2c5a8a;
}

.batch-actions-bar {
  position: sticky;
  bottom: 0;
  background: #fff;
  border: 1px solid #e2e8d8;
  border-radius: 10px;
  padding: 12px 20px;
  margin-top: 20px;
  box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.1);
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  z-index: 10;
}

.batch-info {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  font-size: 14px;
}

.batch-count {
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: 500;
  font-size: 13px;
}

.batch-count.confirm {
  background: #e0f0e0;
  color: #2f7a3a;
}

.batch-count.skip {
  background: #f0f0f0;
  color: #666;
}

.batch-count.adjust {
  background: #e0e8f0;
  color: #2c5a8a;
}

.batch-buttons {
  display: flex;
  gap: 8px;
}

.batch-buttons button {
  padding: 8px 20px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
}

.batch-buttons .ghost {
  background: #fff;
  border: 1px solid #d0d8c5;
}

.batch-buttons .primary {
  background: #2f4a2c;
  color: #fff;
  border: none;
}

.batch-buttons .primary:hover {
  background: #3d5c37;
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: #fff;
  border-radius: 12px;
  max-width: 500px;
  width: 90%;
  max-height: 80vh;
  overflow-y: auto;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #e2e8d8;
}

.modal-header h3 {
  margin: 0;
  color: #2f4a2c;
}

.close-btn {
  background: none;
  border: none;
  font-size: 18px;
  cursor: pointer;
  color: #666;
}

.modal-body {
  padding: 20px;
}

.date-adjust-gear {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 16px;
}

.date-adjust-original {
  margin-bottom: 16px;
}

.date-inputs {
  display: flex;
  gap: 12px;
  margin-bottom: 12px;
}

.date-inputs label {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
  color: #555;
}

.date-inputs input {
  padding: 8px 12px;
  border: 1px solid #d0d8c5;
  border-radius: 6px;
  font-size: 14px;
}

.conflict-warning {
  padding: 10px;
  background: #fdf3e0;
  color: #8a6d1b;
  border-radius: 6px;
  font-size: 13px;
  margin-bottom: 12px;
}

.recommended-dates {
  margin-top: 12px;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 16px 20px;
  border-top: 1px solid #e2e8d8;
}

.modal-footer button {
  padding: 8px 20px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
}

.modal-footer .ghost {
  background: #fff;
  border: 1px solid #d0d8c5;
}

.modal-footer .primary {
  background: #2f4a2c;
  color: #fff;
  border: none;
}

.modal-footer .primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.muted {
  color: #888;
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

@media (max-width: 768px) {
  .details-grid {
    grid-template-columns: 1fr;
  }

  .review-card-header {
    flex-direction: column;
  }

  .priority-info {
    text-align: left;
    width: 100%;
  }

  .date-inputs {
    flex-direction: column;
  }

  .batch-actions-bar {
    flex-direction: column;
    align-items: stretch;
  }

  .batch-info,
  .batch-buttons {
    justify-content: center;
  }
}
</style>

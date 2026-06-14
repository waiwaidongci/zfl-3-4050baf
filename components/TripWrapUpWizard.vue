<template>
  <div class="trip-wrapup-wizard">
    <section v-if="!wrapUp.selectedTripId.value" class="trip-selector">
      <div class="panel">
        <h2>🧭 出行收尾向导</h2>
        <p class="muted">选择一次已结束的出行，系统将引导您完成所有收尾工作</p>
        
        <div v-if="wrapUp.completedTrips.value.length === 0" class="empty-state">
          <p class="muted">暂无已结束的出行</p>
          <p class="muted small">请先在「出行清单」中创建并完成一次出行</p>
        </div>
        
        <div v-else class="trip-list">
          <div
            v-for="trip in wrapUp.completedTrips.value"
            :key="trip.id"
            class="trip-card"
            @click="handleSelectTrip(trip.id)"
          >
            <div class="trip-header">
              <strong>🗺 {{ trip.destination }}</strong>
              <span class="trip-date">📅 {{ trip.startDate }}</span>
            </div>
            <div class="trip-meta">
              <span>👥 {{ trip.members.length }} 人</span>
              <span>🎒 {{ (trip.gears || []).length }} 件装备</span>
            </div>
            <div v-if="getTripProgress(trip.id) > 0" class="trip-progress-bar">
              <div class="trip-progress-fill" :style="{ width: getTripProgress(trip.id) + '%' }"></div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section v-else class="wizard-main">
      <div class="wizard-header">
        <div class="back-button">
          <button class="ghost" @click="handleBack">← 选择其他出行</button>
        </div>
        <div class="trip-info">
          <h2>🧭 {{ wrapUp.selectedTrip.value?.destination }} - 出行收尾</h2>
          <p class="muted">按步骤完成所有收尾工作，生成最终结算单</p>
        </div>
        <div class="progress-overview">
            <div class="progress-circle" :style="{ '--progress': wrapUp.overallProgress.value }">
            <span class="progress-value">{{ wrapUp.overallProgress.value }}%</span>
            <span class="progress-label">完成进度</span>
          </div>
        </div>
      </div>

      <div class="wizard-layout">
        <div class="steps-sidebar">
          <div
            v-for="(step, idx) in wrapUp.getChecklist()"
            :key="step.key"
            class="step-item"
            :class="{
              active: currentStep === step.key,
              completed: step.status === 'completed',
              disabled: !wrapUp.canProceedToStep(step.key)
            }"
            @click="handleStepClick(step.key)"
          >
            <div class="step-icon">
              <span v-if="step.status === 'completed'" class="check-icon">✓</span>
              <span v-else class="step-number">{{ idx + 1 }}</span>
            </div>
            <div class="step-content">
              <div class="step-label">{{ step.icon }} {{ step.label }}</div>
              <div class="step-desc muted">{{ step.description }}</div>
            </div>
            <div v-if="step.count > 0 && step.status !== 'completed'" class="step-badge">
              {{ step.count }}
            </div>
          </div>
        </div>

        <div class="step-content-area">
          <div v-if="currentStep === 'handover'" class="step-panel">
            <h3>📦 未归还交接检查</h3>
            <p class="muted">检查本次出行中借出的装备是否已全部归还</p>
            
            <div v-if="wrapUp.unreturnedHandovers.value.length === 0" class="completed-banner">
              ✓ 所有装备已归还
            </div>
            
            <div v-else class="issue-list">
              <div v-for="handover in wrapUp.unreturnedHandovers.value" :key="handover.id" class="issue-card">
                <div class="issue-header">
                  <strong>{{ handover.gearName }}</strong>
                  <span class="issue-tag warning">未归还</span>
                </div>
                <div class="issue-meta">
                  <span>借用人：{{ handover.borrower }}</span>
                  <span>出借人：{{ handover.owner }}</span>
                </div>
                <div class="issue-actions">
                  <button class="primary small" @click="emit('handle-return', handover.id)">
                    立即归还
                  </button>
                </div>
              </div>
            </div>

            <div class="step-nav">
              <button
                class="primary"
                :disabled="wrapUp.stepStatuses.value.handover !== 'completed'"
                @click="nextStep"
              >
                下一步 →
              </button>
            </div>
          </div>

          <div v-else-if="currentStep === 'inventory'" class="step-panel">
            <h3>📋 未完成盘点检查</h3>
            <p class="muted">检查出行后装备盘点是否已完成</p>
            
            <div v-if="wrapUp.pendingInventories.value.length === 0 && wrapUp.tripInventories.value.length > 0" class="completed-banner">
              ✓ 所有盘点已完成
            </div>

            <div v-if="wrapUp.tripInventories.value.length === 0" class="alert-box warning">
              ⚠️ 尚未创建出行后盘点单
              <button class="primary small" @click="emit('create-inventory', wrapUp.selectedTripId.value)">
                创建盘点单
              </button>
            </div>
            
            <div v-else class="issue-list">
              <div v-for="inv in wrapUp.tripInventories.value" :key="inv.id" class="issue-card">
                <div class="issue-header">
                  <strong>{{ inv.name }}</strong>
                  <span :class="['issue-tag', inv.status === '已完成' ? 'success' : 'warning']">
                    {{ inv.status }}
                  </span>
                </div>
                <div class="issue-meta">
                  <span>盘点人：{{ inv.checker || '未指定' }}</span>
                  <span>日期：{{ inv.date }}</span>
                </div>
                <div class="progress-bar">
                  <div
                    class="progress-fill"
                    :style="{ width: getInventoryProgress(inv) + '%' }"
                  ></div>
                  <span class="progress-text">{{ getInventoryProgress(inv) }}%</span>
                </div>
                <div class="issue-actions">
                  <button v-if="inv.status !== '已完成'" class="primary small" @click="emit('open-inventory', inv.id)">
                    继续盘点
                  </button>
                  <button v-else class="ghost small" @click="emit('open-inventory', inv.id)">
                    查看详情
                  </button>
                </div>
              </div>
            </div>

            <div class="step-nav">
              <button class="ghost" @click="prevStep">← 上一步</button>
              <button
                class="primary"
                :disabled="wrapUp.stepStatuses.value.inventory !== 'completed'"
                @click="nextStep"
              >
                下一步 →
              </button>
            </div>
          </div>

          <div v-else-if="currentStep === 'abnormal'" class="step-panel">
            <h3>⚠️ 盘点异常处理</h3>
            <p class="muted">处理盘点中发现的异常情况（缺失、损坏、配件缺失等）</p>
            
            <div v-if="wrapUp.abnormalItems.value.length === 0" class="completed-banner">
              ✓ 无异常项
            </div>
            
            <div v-else class="issue-list">
              <div v-for="item in wrapUp.abnormalItems.value" :key="item.id" class="issue-card">
                <div class="issue-header">
                  <strong>{{ item.gearName }}</strong>
                  <span class="issue-tag danger">有异常</span>
                </div>
                <div class="issue-meta">
                  <span>所有人：{{ item.owner }}</span>
                  <span>盘点：{{ item.inventoryName }}</span>
                </div>
                <div class="abnormal-details">
                  <div v-if="item.checkStatus === '缺失'" class="abnormal-tag danger">
                    ⚠️ 装备缺失
                  </div>
                  <div v-if="item.missingAccessories" class="abnormal-tag warning">
                    📦 配件缺失：{{ item.missingAccessories }}
                  </div>
                  <div v-if="item.notes" class="abnormal-tag info">
                    📝 备注：{{ item.notes }}
                  </div>
                </div>

                <div v-if="item.abnormalActions && item.abnormalActions.length > 0" class="action-list">
                  <div
                    v-for="action in item.abnormalActions"
                    :key="action.id"
                    class="action-item"
                    :class="{ pending: action.status === '待处理', done: action.status === '已处理' }"
                  >
                    <span class="action-type">{{ action.type }}</span>
                    <span v-if="action.description" class="action-desc">{{ action.description }}</span>
                    <span v-if="action.amount && action.amount !== '0'" class="action-amount">
                      ¥{{ action.amount }}
                    </span>
                    <span :class="['action-status', action.status]">{{ action.status }}</span>
                  </div>
                </div>

                <div class="issue-actions">
                  <button class="primary small" @click="emit('open-inventory', item.inventoryId)">
                    处理异常
                  </button>
                </div>
              </div>
            </div>

            <div v-if="wrapUp.pendingAbnormalActions.value.length > 0" class="alert-box warning">
              ⚠️ 有 {{ wrapUp.pendingAbnormalActions.value.length }} 个异常处理待确认
            </div>

            <div class="step-nav">
              <button class="ghost" @click="prevStep">← 上一步</button>
              <button
                class="primary"
                :disabled="wrapUp.stepStatuses.value.abnormal !== 'completed'"
                @click="nextStep"
              >
                下一步 →
              </button>
            </div>
          </div>

          <div v-else-if="currentStep === 'deposit'" class="step-panel">
            <h3>💰 押金扣除确认</h3>
            <p class="muted">确认盘点异常转为押金扣除的金额，并处理押金退还</p>
            
            <div v-if="wrapUp.pendingDepositDeductions.value.length === 0 && wrapUp.pendingDepositConfirmations.value.length === 0" class="completed-banner">
              ✓ 所有押金已处理完毕
            </div>
            
            <div v-if="wrapUp.pendingDepositDeductions.value.length > 0" class="section-block">
              <h4>待确认的盘点异常扣款</h4>
              <div class="issue-list">
                <div
                  v-for="action in wrapUp.pendingDepositDeductions.value"
                  :key="action.id"
                  class="issue-card"
                >
                  <div class="issue-header">
                    <strong>{{ action.gearName }}</strong>
                    <span class="issue-tag warning">待确认扣款</span>
                  </div>
                  <div class="issue-meta">
                    <span>责任人：{{ action.borrower || action.owner }}</span>
                    <span>金额：<strong class="danger">¥{{ action.amount }}</strong></span>
                  </div>
                  <div v-if="action.description" class="issue-desc">
                    原因：{{ action.description }}
                  </div>
                  <div class="issue-actions">
                    <button class="primary small" @click="emit('confirm-deduct', action)">
                      确认扣款
                    </button>
                    <button class="ghost small" @click="emit('open-inventory', action.inventoryId)">
                      修改处理
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div v-if="wrapUp.pendingDepositConfirmations.value.length > 0" class="section-block">
              <h4>待处理的押金记录</h4>
              <div class="issue-list">
                <div
                  v-for="deposit in wrapUp.pendingDepositConfirmations.value"
                  :key="deposit.id"
                  class="issue-card"
                >
                  <div class="issue-header">
                    <strong>{{ deposit.gearName }}</strong>
                    <span class="issue-tag info">{{ deposit.status }}</span>
                  </div>
                  <div class="issue-meta">
                    <span>借用人：{{ deposit.borrower }}</span>
                    <span>押金：¥{{ deposit.depositAmount }}</span>
                    <span>已收：¥{{ deposit.receivedAmount }}</span>
                  </div>
                  <div v-if="deposit.deductedAmount !== '0'" class="issue-desc">
                    已扣除：¥{{ deposit.deductedAmount }}
                    <span v-if="deposit.deductReason">（{{ deposit.deductReason }}）</span>
                  </div>
                  <div class="issue-actions">
                    <button class="primary small" @click="emit('open-deposit', deposit.id)">
                      处理押金
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div class="step-nav">
              <button class="ghost" @click="prevStep">← 上一步</button>
              <button
                class="primary"
                :disabled="wrapUp.stepStatuses.value.deposit !== 'completed'"
                @click="nextStep"
              >
                下一步 →
              </button>
            </div>
          </div>

          <div v-else-if="currentStep === 'expense'" class="step-panel">
            <h3>🧾 公共费用录入</h3>
            <p class="muted">录入并分摊本次出行的公共费用（食材、门票、交通费等）</p>
            
            <div v-if="!wrapUp.existingSettlement.value" class="alert-box info">
              ℹ️ 需要先创建结算单才能录入公共费用
              <button class="primary small" @click="emit('create-settlement', wrapUp.selectedTripId.value)">
                创建结算单
              </button>
            </div>

            <div v-else>
              <div class="settlement-summary">
                <div class="summary-card">
                  <span class="summary-label">公共费用总额</span>
                  <span class="summary-value">¥{{ wrapUp.existingSettlement.value.totalExtraExpenses }}</span>
                </div>
                <div class="summary-card">
                  <span class="summary-label">人均分摊</span>
                  <span class="summary-value">¥{{ wrapUp.existingSettlement.value.totalPerMember }}</span>
                </div>
              </div>

              <div v-if="wrapUp.existingSettlement.value.extraExpenses.length === 0" class="muted empty-expenses">
                暂无公共费用，可在结算单中添加
              </div>

              <div v-else class="expense-list">
                <div
                  v-for="expense in wrapUp.existingSettlement.value.extraExpenses"
                  :key="expense.id"
                  class="expense-item"
                >
                  <span class="expense-name">{{ expense.name }}</span>
                  <span class="expense-amount">¥{{ expense.amount }}</span>
                  <span class="expense-payer">垫付：{{ expense.paidBy || '未指定' }}</span>
                </div>
              </div>

              <div class="issue-actions">
                <button class="primary small" @click="emit('open-settlement', wrapUp.existingSettlement.value.id)">
                  管理费用
                </button>
              </div>
            </div>

            <div class="step-nav">
              <button class="ghost" @click="prevStep">← 上一步</button>
              <button
                class="primary"
                :disabled="wrapUp.stepStatuses.value.expense !== 'completed'"
                @click="nextStep"
              >
                下一步 →
              </button>
            </div>
          </div>

          <div v-else-if="currentStep === 'payment'" class="step-panel">
            <h3>💳 成员付款状态</h3>
            <p class="muted">确认每位成员的付款状态，标记已支付的成员</p>
            
            <div v-if="!wrapUp.existingSettlement.value" class="alert-box info">
              ℹ️ 需要先创建结算单
              <button class="primary small" @click="emit('create-settlement', wrapUp.selectedTripId.value)">
                创建结算单
              </button>
            </div>

            <div v-else class="payment-list">
              <div
                v-for="(member, idx) in wrapUp.existingSettlement.value.members"
                :key="member.memberId || member.nickname"
                class="payment-card"
                :class="{ 'paid': member.paymentStatus === '已支付' }"
              >
                <div class="payment-header">
                  <strong>{{ member.nickname }}</strong>
                  <span :class="['payment-status', member.paymentStatus]">
                    {{ member.paymentStatus }}
                  </span>
                </div>
                <div class="payment-details">
                  <div class="payment-row">
                    <span>应付总额：</span>
                    <strong>¥{{ member.totalOwed }}</strong>
                  </div>
                  <div class="payment-row">
                    <span>已付金额：</span>
                    <strong>¥{{ member.paidAmount }}</strong>
                  </div>
                  <div class="payment-row">
                    <span>剩余：</span>
                    <strong :class="Number(member.totalOwed) - Number(member.paidAmount) > 0 ? 'danger' : 'success'">
                      ¥{{ (Number(member.totalOwed) - Number(member.paidAmount)).toFixed(2) }}
                    </strong>
                  </div>
                </div>
              </div>
            </div>

            <div v-if="wrapUp.existingSettlement.value" class="issue-actions">
              <button class="primary small" @click="emit('open-settlement', wrapUp.existingSettlement.value.id)">
                更新付款状态
              </button>
            </div>

            <div class="step-nav">
              <button class="ghost" @click="prevStep">← 上一步</button>
              <button
                class="primary"
                :disabled="wrapUp.stepStatuses.value.payment !== 'completed'"
                @click="nextStep"
              >
                下一步 →
              </button>
            </div>
          </div>

          <div v-else-if="currentStep === 'settlement'" class="step-panel">
            <h3>📄 生成结算单</h3>
            <p class="muted">生成或刷新最终结算单，完成整个出行收尾流程</p>
            
            <div v-if="!wrapUp.existingSettlement.value" class="alert-box info">
              ℹ️ 尚未创建结算单
              <button class="primary small" @click="emit('create-settlement', wrapUp.selectedTripId.value)">
                生成结算单
              </button>
            </div>

            <div v-else>
              <div class="settlement-final-summary">
                <div class="summary-grid">
                  <div class="summary-card">
                    <span class="summary-label">押金合计</span>
                    <span class="summary-value">¥{{ wrapUp.existingSettlement.value.totalDeposit }}</span>
                  </div>
                  <div class="summary-card">
                    <span class="summary-label">扣除合计</span>
                    <span class="summary-value danger">¥{{ wrapUp.existingSettlement.value.totalDeducted }}</span>
                  </div>
                  <div class="summary-card">
                    <span class="summary-label">公共费用</span>
                    <span class="summary-value warning">¥{{ wrapUp.existingSettlement.value.totalExtraExpenses }}</span>
                  </div>
                  <div class="summary-card">
                    <span class="summary-label">人均分摊</span>
                    <span class="summary-value info">¥{{ wrapUp.existingSettlement.value.totalPerMember }}</span>
                  </div>
                </div>

                <div class="settlement-status-row">
                  <span class="status-label">当前状态：</span>
                  <span :class="['status-badge', wrapUp.existingSettlement.value.status]">
                    {{ wrapUp.existingSettlement.value.status }}
                  </span>
                </div>
              </div>

              <div class="final-actions">
                <button class="ghost small" @click="emit('refresh-settlement', wrapUp.existingSettlement.value.id)">
                  🔄 从押金台账同步
                </button>
                <button class="primary small" @click="emit('open-settlement', wrapUp.existingSettlement.value.id)">
                  查看/编辑结算单
                </button>
              </div>

              <div v-if="wrapUp.isAllCompleted.value" class="success-banner">
                🎉 所有步骤已完成！可以将结算单标记为「已结算」
              </div>
              <div v-else class="alert-box warning">
                ⚠️ 还有未完成的步骤，请先完成前面的步骤
              </div>
            </div>

            <div class="step-nav">
              <button class="ghost" @click="prevStep">← 上一步</button>
              <button
                v-if="wrapUp.existingSettlement.value && wrapUp.isAllCompleted.value && wrapUp.existingSettlement.value.status !== '已结算'"
                class="primary"
                @click="emit('finalize-settlement', wrapUp.existingSettlement.value.id)"
              >
                ✓ 标记为已结算
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, watch, computed } from 'vue';
import { WRAPUP_STEPS } from '../composables/useTripWrapUp.js';

const props = defineProps({
  tripWrapUp: { type: Object, required: true },
  selectedTripId: { type: String, default: null },
  editingInventoryId: { type: String, default: null },
  editingSettlementId: { type: String, default: null },
  currentUser: { type: String, default: '' }
});

const emit = defineEmits([
  'select-trip',
  'handle-return',
  'create-inventory',
  'open-inventory',
  'confirm-deduct',
  'open-deposit',
  'create-settlement',
  'open-settlement',
  'refresh-settlement',
  'finalize-settlement'
]);

const wrapUp = computed(() => props.tripWrapUp);
const currentStep = ref('handover');

function handleSelectTrip(tripId) {
  wrapUp.value.selectTrip(tripId);
  currentStep.value = wrapUp.value.getNextIncompleteStep() || 'handover';
  emit('select-trip', tripId);
}

function handleBack() {
  wrapUp.value.selectTrip(null);
  currentStep.value = 'handover';
  emit('select-trip', null);
}

function handleStepClick(stepKey) {
  if (wrapUp.value.canProceedToStep(stepKey)) {
    currentStep.value = stepKey;
  } else {
    alert('请先完成前面的步骤');
  }
}

function nextStep() {
  const currentIdx = WRAPUP_STEPS.findIndex((s) => s.key === currentStep.value);
  if (currentIdx < WRAPUP_STEPS.length - 1) {
    currentStep.value = WRAPUP_STEPS[currentIdx + 1].key;
  }
}

function prevStep() {
  const currentIdx = WRAPUP_STEPS.findIndex((s) => s.key === currentStep.value);
  if (currentIdx > 0) {
    currentStep.value = WRAPUP_STEPS[currentIdx - 1].key;
  }
}

function getInventoryProgress(inv) {
  const total = inv.items?.length || 0;
  const checked = inv.items?.filter((i) => i.checkStatus === '已盘点').length || 0;
  return total > 0 ? Math.round((checked / total) * 100) : 0;
}

function getTripProgress(tripId) {
  const prevSelected = wrapUp.value.selectedTripId.value;
  wrapUp.value.selectTrip(tripId);
  const progress = wrapUp.value.overallProgress.value;
  if (prevSelected) {
    wrapUp.value.selectTrip(prevSelected);
  }
  return progress;
}

watch(
  () => props.selectedTripId,
  (newId) => {
    if (newId && newId !== wrapUp.value.selectedTripId.value) {
      wrapUp.value.selectTrip(newId);
    }
    if (newId) {
      currentStep.value = wrapUp.value.getNextIncompleteStep() || 'handover';
    }
  },
  { immediate: true }
);
</script>

<style scoped>
.trip-wrapup-wizard {
  width: 100%;
}

.panel {
  background: #fff;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.panel h2 {
  margin: 0 0 8px 0;
  color: #2f4a2c;
  font-size: 20px;
}

.panel h3 {
  margin: 0 0 8px 0;
  color: #2f4a2c;
  font-size: 18px;
}

.panel h4 {
  margin: 20px 0 12px 0;
  color: #2f4a2c;
  font-size: 15px;
}

.muted {
  color: #888;
  font-size: 13px;
}

.muted.small {
  font-size: 12px;
}

.empty-state {
  padding: 40px 20px;
  text-align: center;
  color: #999;
}

.trip-selector .trip-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
  margin-top: 20px;
}

.trip-card {
  border: 1px solid #e8ece4;
  border-radius: 10px;
  padding: 16px;
  cursor: pointer;
  transition: all 0.15s;
}

.trip-card:hover {
  border-color: #2f4a2c;
  box-shadow: 0 2px 8px rgba(47, 74, 44, 0.1);
}

.trip-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.trip-header strong {
  color: #2f4a2c;
}

.trip-date {
  font-size: 12px;
  color: #888;
}

.trip-meta {
  display: flex;
  gap: 16px;
  font-size: 13px;
  color: #666;
  margin-bottom: 10px;
}

.trip-progress-bar {
  height: 6px;
  background: #f0f4ed;
  border-radius: 3px;
  overflow: hidden;
}

.trip-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #4caf50, #2f4a2c);
  transition: width 0.3s;
}

.wizard-header {
  display: flex;
  align-items: center;
  gap: 20px;
  background: #fff;
  border-radius: 12px;
  padding: 20px 24px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.wizard-header h2 {
  margin: 0 0 4px 0;
  color: #2f4a2c;
  font-size: 20px;
}

.wizard-header p {
  margin: 0;
}

.back-button {
  flex-shrink: 0;
}

.trip-info {
  flex: 1;
  min-width: 200px;
}

.progress-overview {
  flex-shrink: 0;
}

.progress-circle {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: conic-gradient(#4caf50 calc(var(--progress) * 1%), #e8ece4 0);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  position: relative;
}

.progress-circle::before {
  content: '';
  position: absolute;
  width: 64px;
  height: 64px;
  background: #fff;
  border-radius: 50%;
}

.progress-value,
.progress-label {
  position: relative;
  z-index: 1;
}

.progress-value {
  font-size: 18px;
  font-weight: 700;
  color: #2f4a2c;
}

.progress-label {
  font-size: 10px;
  color: #888;
}

.wizard-layout {
  display: flex;
  gap: 20px;
  align-items: flex-start;
}

.steps-sidebar {
  width: 280px;
  flex-shrink: 0;
  background: #fff;
  border-radius: 12px;
  padding: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  position: sticky;
  top: 20px;
}

.step-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s;
  margin-bottom: 4px;
}

.step-item:hover:not(.disabled) {
  background: #f7f9f5;
}

.step-item.active {
  background: #e8f5e9;
  border: 1px solid #4caf50;
}

.step-item.completed {
  opacity: 0.8;
}

.step-item.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.step-icon {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: #f0f4ed;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-size: 14px;
  font-weight: 600;
  color: #63705d;
}

.step-item.completed .step-icon {
  background: #4caf50;
  color: #fff;
}

.step-item.active .step-icon {
  background: #2f4a2c;
  color: #fff;
}

.check-icon {
  color: #fff;
}

.step-content {
  flex: 1;
  min-width: 0;
}

.step-label {
  font-size: 14px;
  font-weight: 500;
  color: #2f4a2c;
}

.step-desc {
  font-size: 11px;
  margin-top: 2px;
}

.step-badge {
  background: #fee;
  color: #c53030;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
  flex-shrink: 0;
}

.step-content-area {
  flex: 1;
  min-width: 0;
}

.step-panel {
  background: #fff;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.completed-banner {
  background: #d4edda;
  color: #155724;
  padding: 16px;
  border-radius: 8px;
  text-align: center;
  font-weight: 500;
  margin: 20px 0;
}

.success-banner {
  background: #d4edda;
  color: #155724;
  padding: 16px;
  border-radius: 8px;
  text-align: center;
  font-weight: 500;
  margin: 20px 0;
  font-size: 15px;
}

.alert-box {
  padding: 14px 16px;
  border-radius: 8px;
  margin: 16px 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.alert-box.warning {
  background: #fffbeb;
  border: 1px solid #fcd34d;
  color: #92400e;
}

.alert-box.info {
  background: #eff6ff;
  border: 1px solid #93c5fd;
  color: #1e40af;
}

.issue-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin: 16px 0;
}

.issue-card {
  border: 1px solid #e8ece4;
  border-radius: 10px;
  padding: 16px;
}

.issue-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.issue-header strong {
  color: #2f4a2c;
  font-size: 15px;
}

.issue-tag {
  padding: 3px 10px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 600;
}

.issue-tag.warning {
  background: #fffbeb;
  color: #92400e;
}

.issue-tag.danger {
  background: #fee;
  color: #c53030;
}

.issue-tag.success {
  background: #d4edda;
  color: #155724;
}

.issue-tag.info {
  background: #dbeafe;
  color: #1e40af;
}

.issue-meta {
  display: flex;
  gap: 16px;
  font-size: 13px;
  color: #666;
  margin-bottom: 10px;
  flex-wrap: wrap;
}

.issue-desc {
  font-size: 13px;
  color: #555;
  margin-bottom: 10px;
  padding: 8px 12px;
  background: #f7f9f5;
  border-radius: 6px;
}

.issue-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.abnormal-details {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
}

.abnormal-tag {
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 12px;
}

.abnormal-tag.danger {
  background: #fee;
  color: #c53030;
}

.abnormal-tag.warning {
  background: #fffbeb;
  color: #92400e;
}

.abnormal-tag.info {
  background: #eff6ff;
  color: #1e40af;
}

.action-list {
  margin: 10px 0;
  padding-top: 10px;
  border-top: 1px dashed #eee;
}

.action-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: #f7f9f5;
  border-radius: 6px;
  margin-bottom: 4px;
  font-size: 12px;
  flex-wrap: wrap;
}

.action-item.pending {
  background: #fffbeb;
}

.action-item.done {
  background: #d4edda;
}

.action-type {
  font-weight: 600;
  color: #2f4a2c;
}

.action-desc {
  color: #666;
}

.action-amount {
  font-weight: 600;
  color: #c53030;
}

.action-status {
  margin-left: auto;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 500;
}

.action-status.待处理 {
  background: #fffbeb;
  color: #92400e;
}

.action-status.已处理 {
  background: #d4edda;
  color: #155724;
}

.progress-bar {
  position: relative;
  height: 24px;
  background: #f0f4ed;
  border-radius: 12px;
  overflow: hidden;
  margin-bottom: 10px;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #4caf50, #2f4a2c);
  transition: width 0.3s;
}

.progress-text {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 11px;
  font-weight: 600;
  color: #333;
}

.section-block {
  margin-top: 24px;
  padding-top: 20px;
  border-top: 1px solid #eee;
}

.settlement-summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 12px;
  margin: 16px 0;
}

.summary-card {
  background: #f7f9f5;
  border-radius: 10px;
  padding: 16px;
  text-align: center;
}

.summary-label {
  display: block;
  font-size: 12px;
  color: #888;
  margin-bottom: 6px;
}

.summary-value {
  display: block;
  font-size: 22px;
  font-weight: 700;
  color: #2f4a2c;
}

.summary-value.danger {
  color: #c53030;
}

.summary-value.warning {
  color: #b45309;
}

.summary-value.info {
  color: #1e40af;
}

.empty-expenses {
  padding: 20px;
  text-align: center;
}

.expense-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
}

.expense-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  background: #f7f9f5;
  border-radius: 8px;
  font-size: 13px;
}

.expense-name {
  font-weight: 500;
  min-width: 100px;
}

.expense-amount {
  font-weight: 600;
  color: #b45309;
}

.expense-payer {
  color: #666;
  margin-left: auto;
}

.payment-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 12px;
  margin: 16px 0;
}

.payment-card {
  border: 1px solid #e8ece4;
  border-radius: 10px;
  padding: 16px;
}

.payment-card.paid {
  border-color: #4caf50;
  background: #f0fdf4;
}

.payment-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.payment-header strong {
  color: #2f4a2c;
}

.payment-status {
  padding: 3px 10px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 600;
}

.payment-status.未支付 {
  background: #fee;
  color: #c53030;
}

.payment-status.部分支付 {
  background: #fffbeb;
  color: #92400e;
}

.payment-status.已支付 {
  background: #d4edda;
  color: #155724;
}

.payment-details {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.payment-row {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  color: #555;
}

.danger {
  color: #c53030;
}

.success {
  color: #155724;
}

.settlement-final-summary {
  margin: 16px 0;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}

.settlement-status-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px;
  background: #f7f9f5;
  border-radius: 8px;
}

.status-label {
  font-size: 14px;
  color: #555;
}

.status-badge {
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 600;
}

.status-badge.草稿 {
  background: #f0f4ed;
  color: #63705d;
}

.status-badge.已确认 {
  background: #dbeafe;
  color: #1e40af;
}

.status-badge.已结算 {
  background: #d4edda;
  color: #155724;
}

.final-actions {
  display: flex;
  gap: 10px;
  justify-content: center;
  margin: 16px 0;
  flex-wrap: wrap;
}

.step-nav {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 24px;
  padding-top: 20px;
  border-top: 1px solid #eee;
}

button {
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
  font-family: inherit;
}

button.primary {
  background: #2f4a2c;
  color: #fff;
}

button.primary:hover:not(:disabled) {
  background: #3d5c37;
}

button.primary:disabled {
  background: #a8b5a0;
  cursor: not-allowed;
}

button.ghost {
  background: transparent;
  color: #666;
  border: 1px solid #d0d8c5;
}

button.ghost:hover {
  background: #f7f9f5;
}

button.small {
  padding: 6px 12px;
  font-size: 13px;
}

@media (max-width: 1024px) {
  .wizard-layout {
    flex-direction: column;
  }

  .steps-sidebar {
    width: 100%;
    position: static;
  }

  .step-item {
    padding: 10px;
  }
}

@media (max-width: 640px) {
  .wizard-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }

  .trip-list {
    grid-template-columns: 1fr;
  }

  .payment-list {
    grid-template-columns: 1fr;
  }
}
</style>

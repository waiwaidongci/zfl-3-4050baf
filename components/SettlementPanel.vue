<template>
  <div class="settlement-panel">
    <section v-if="!selectedId" class="layout">
      <form class="panel" @submit.prevent="handleCreate">
        <h2>新建结算单</h2>
        <label class="muted">结算单名称</label>
        <input v-model="createForm.name" placeholder="例如：天目湖露营结算" />
        <label class="muted">关联出行（可选，自动带入参与成员和押金）</label>
        <select v-model="createForm.tripId" @change="handleTripChange">
          <option value="">不关联出行</option>
          <option v-for="trip in trips" :key="trip.id" :value="trip.id">
            {{ trip.destination }} · {{ trip.startDate }}
          </option>
        </select>
        <div v-if="!createForm.tripId">
          <label class="muted">选择参与成员</label>
          <div class="checkbox-list">
            <label v-for="member in members" :key="member.id" class="checkbox-item">
              <input type="checkbox" :value="member.id" v-model="createForm.memberIds" />
              <span>{{ member.nickname }}</span>
            </label>
          </div>
        </div>
        <div v-else-if="tripMemberNames.length > 0" class="auto-members">
          <label class="muted">参与成员（来自出行）</label>
          <div class="member-tags">
            <span v-for="name in tripMemberNames" :key="name" class="member-tag">{{ name }}</span>
          </div>
          <label class="muted" style="margin-top: 10px;">出行装备（将纳入押金结算）</label>
          <div class="member-tags">
            <span v-for="gear in selectedTripGears" :key="gear.gearId || gear.gearName" class="gear-tag">
              {{ gear.gearName }}
            </span>
          </div>
          <p v-if="selectedTripGears.length === 0" class="muted" style="font-size: 12px; margin-top: 4px;">
            此出行暂无装备，结算单将无押金项
          </p>
        </div>
        <button type="submit">创建结算单</button>
      </form>

      <div class="panel wide">
        <div class="toolbar">
          <h2>结算单列表</h2>
          <span class="muted">共 {{ settlementRecords.length }} 份</span>
        </div>
        <div v-if="settlementRecords.length === 0" class="empty-state muted">
          暂无结算单，创建一个吧！
        </div>
        <div v-else class="settlement-list">
          <article
            v-for="record in settlementRecords"
            :key="record.id"
            class="settlement-card"
            @click="selectSettlement(record.id)"
          >
            <div class="settlement-header">
              <strong>{{ record.name }}</strong>
              <span :class="['status-badge', record.status]">{{ record.status }}</span>
            </div>
            <div class="settlement-meta">
              <span v-if="record.tripName">🗺 {{ record.tripName }}</span>
              <span>👥 {{ record.members.length }} 人</span>
              <span>📅 {{ record.createdAt }}</span>
            </div>
            <div class="settlement-summary-row">
              <span>押金合计 ¥{{ record.totalDeposit }}</span>
              <span>扣除合计 ¥{{ record.totalDeducted }}</span>
              <span>公共费用 ¥{{ record.totalExtraExpenses }}</span>
            </div>
            <div class="settlement-actions" @click.stop>
              <button class="ghost small danger" @click="handleDelete(record.id)">删除</button>
            </div>
          </article>
        </div>
      </div>
    </section>

    <section v-else class="panel">
      <div v-if="currentSettlement">
        <div class="detail-header">
          <button class="ghost" @click="goBack">← 返回列表</button>
          <h2>{{ currentSettlement.name }}</h2>
          <div class="detail-header-actions">
            <select
              :value="currentSettlement.status"
              @change="handleStatusChange($event.target.value)"
              :disabled="currentSettlement.status === '已结算'"
            >
              <option v-for="s in ['草稿','已确认','已结算']" :key="s">{{ s }}</option>
            </select>
            <button class="ghost small" @click="handleRefreshDeposits">🔄 同步押金</button>
          </div>
        </div>

        <div class="detail-info">
          <span v-if="currentSettlement.tripName" class="info-tag">🗺 关联出行：{{ currentSettlement.tripName }}</span>
          <span class="info-tag">📅 创建日期：{{ currentSettlement.createdAt }}</span>
          <span class="info-tag">📅 更新日期：{{ currentSettlement.updatedAt }}</span>
        </div>

        <div class="summary-cards">
          <div class="summary-card">
            <span class="summary-value">¥{{ currentSettlement.totalDeposit }}</span>
            <span class="summary-label">押金合计</span>
          </div>
          <div class="summary-card">
            <span class="summary-value deducted">¥{{ currentSettlement.totalDeducted }}</span>
            <span class="summary-label">扣除合计</span>
          </div>
          <div class="summary-card">
            <span class="summary-value extra">¥{{ currentSettlement.totalExtraExpenses }}</span>
            <span class="summary-label">公共费用</span>
          </div>
          <div class="summary-card">
            <span class="summary-value per-member">¥{{ currentSettlement.totalPerMember }}</span>
            <span class="summary-label">人均分摊</span>
          </div>
        </div>

        <div class="section-block">
          <div class="section-header">
            <h3>👥 成员结算明细</h3>
          </div>
          <div class="member-settlement-list">
            <article
              v-for="(sm, mIdx) in currentSettlement.members"
              :key="sm.memberId || sm.nickname"
              class="member-settlement-card"
            >
              <div class="ms-header">
                <strong>{{ sm.nickname }}</strong>
                <span :class="['payment-badge', sm.paymentStatus]">{{ sm.paymentStatus }}</span>
              </div>

              <div v-if="sm.depositItems.length > 0" class="ms-deposits">
                <div class="ms-sub-title">所借装备押金</div>
                <div v-for="(dep, dIdx) in sm.depositItems" :key="dep.depositId" class="ms-deposit-row">
                  <span class="dep-gear">{{ dep.gearName }}</span>
                  <span class="dep-amount">押金 ¥{{ dep.depositAmount }}</span>
                  <span class="dep-deducted">已扣除 ¥{{ dep.deductedAmount }}</span>
                  <div class="dep-actual">
                    <label>本次结算扣除</label>
                    <input
                      type="number"
                      min="0"
                      :value="dep.actualDeduct"
                      @change="handleMemberDeduct(mIdx, dIdx, $event.target.value)"
                      :disabled="currentSettlement.status === '已结算'"
                      class="small-input"
                    />
                  </div>
                </div>
              </div>
              <div v-else class="ms-no-deposits muted">无关联押金记录</div>

              <div class="ms-extra-share">
                公共费用分摊：<strong>¥{{ sm.extraShare }}</strong>
              </div>

              <div class="ms-total-row">
                <span>应付总额：<strong>¥{{ sm.totalOwed }}</strong></span>
              </div>

              <div class="ms-payment-row">
                <label>已付金额</label>
                <input
                  type="number"
                  min="0"
                  :value="sm.paidAmount"
                  @change="handleMemberPayment(mIdx, $event.target.value)"
                  :disabled="currentSettlement.status === '已结算'"
                  class="small-input"
                />
                <span class="ms-remain">
                  {{ (Number(sm.totalOwed) - Number(sm.paidAmount) > 0)
                    ? `欠 ¥${(Number(sm.totalOwed) - Number(sm.paidAmount)).toFixed(2)}`
                    : '已结清' }}
                </span>
              </div>

              <div class="ms-notes-row">
                <input
                  :value="sm.notes"
                  @change="handleMemberNotes(mIdx, $event.target.value)"
                  placeholder="备注"
                  class="small-input full"
                />
              </div>
            </article>
          </div>
        </div>

        <div class="section-block">
          <div class="section-header">
            <h3>💰 额外公共费用</h3>
            <button
              class="ghost small"
              @click="showExpenseForm = true"
              :disabled="currentSettlement.status === '已结算'"
            >+ 添加</button>
          </div>

          <div v-if="showExpenseForm" class="expense-form">
            <input v-model="expenseForm.name" placeholder="费用名称（如：食材采购）" class="small-input" />
            <input v-model.number="expenseForm.amount" type="number" min="0" placeholder="金额" class="small-input" />
            <select v-model="expenseForm.paidBy" class="small-input">
              <option value="">选择垫付人</option>
              <option v-for="member in members" :key="member.id" :value="member.nickname">
                {{ member.nickname }}
              </option>
            </select>
            <div class="expense-form-actions">
              <button @click="handleAddExpense">添加</button>
              <button class="ghost small" @click="showExpenseForm = false">取消</button>
            </div>
          </div>

          <div v-if="currentSettlement.extraExpenses.length === 0" class="muted no-expenses">
            暂无额外公共费用
          </div>
          <div v-else class="expense-list">
            <div v-for="exp in currentSettlement.extraExpenses" :key="exp.id" class="expense-row">
              <span class="exp-name">{{ exp.name }}</span>
              <span class="exp-amount">¥{{ exp.amount }}</span>
              <span class="exp-payer">垫付：{{ exp.paidBy || '未指定' }}</span>
              <button
                v-if="currentSettlement.status !== '已结算'"
                class="ghost small danger"
                @click="handleRemoveExpense(exp.id)"
              >删除</button>
            </div>
          </div>
        </div>

        <div class="section-block">
          <h3>📝 备注</h3>
          <textarea
            :value="currentSettlement.notes"
            @change="handleNotesChange($event.target.value)"
            placeholder="结算说明或注意事项"
            rows="3"
            :disabled="currentSettlement.status === '已结算'"
          ></textarea>
        </div>
      </div>
      <div v-else class="empty-state">
        <p>结算单不存在</p>
        <button class="ghost" @click="goBack">返回列表</button>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, computed, watch, toRef } from 'vue';
import { useSettlement } from '../composables/useSettlement.js';

const props = defineProps({
  settlementRecords: { type: Array, default: () => [] },
  trips: { type: Array, default: () => [] },
  members: { type: Array, default: () => [] },
  depositRecords: { type: Array, default: () => [] },
  gears: { type: Array, default: () => [] },
  requests: { type: Array, default: () => [] },
  currentUser: { type: String, default: '' }
});

const emit = defineEmits(['update:settlementRecords']);

const selectedId = ref(null);
const showExpenseForm = ref(false);
const expenseForm = ref({ name: '', amount: '', paidBy: '' });

const createForm = ref({
  name: '',
  tripId: '',
  memberIds: []
});

const settlement = useSettlement({
  settlementRecords: toRef(props, 'settlementRecords'),
  trips: toRef(props, 'trips'),
  members: toRef(props, 'members'),
  depositRecords: toRef(props, 'depositRecords'),
  gears: toRef(props, 'gears'),
  requests: toRef(props, 'requests')
});

const currentSettlement = computed(() => settlement.getById(selectedId.value));

const tripMemberNames = computed(() => {
  if (!createForm.value.tripId) return [];
  const trip = props.trips.find((t) => t.id === createForm.value.tripId);
  return trip ? trip.members : [];
});

const selectedTripGears = computed(() => {
  if (!createForm.value.tripId) return [];
  const trip = props.trips.find((t) => t.id === createForm.value.tripId);
  return trip ? (trip.gears || []) : [];
});

watch(
  () => props.currentUser,
  (val) => {
    if (val && !expenseForm.value.paidBy) {
      expenseForm.value.paidBy = val;
    }
  },
  { immediate: true }
);

function updateRecords(updated) {
  emit('update:settlementRecords', updated);
}

function applyUpdate(newRecord) {
  if (!newRecord) return;
  updateRecords(
    props.settlementRecords.map((s) => (s.id === selectedId.value ? newRecord : s))
  );
}

function selectSettlement(id) {
  selectedId.value = id;
}

function goBack() {
  selectedId.value = null;
  showExpenseForm.value = false;
}

function handleTripChange() {
  if (createForm.value.tripId) {
    createForm.value.memberIds = [];
  }
}

function handleCreate() {
  let newRecord;
  if (createForm.value.tripId) {
    newRecord = settlement.createForTrip(createForm.value.tripId);
    if (createForm.value.name.trim()) {
      newRecord = { ...newRecord, name: createForm.value.name.trim() };
    }
  } else {
    if (createForm.value.memberIds.length === 0) {
      alert('请至少选择一位参与成员');
      return;
    }
    newRecord = settlement.createManual(
      createForm.value.name.trim(),
      createForm.value.memberIds
    );
  }
  if (!newRecord) return;
  updateRecords([newRecord, ...props.settlementRecords]);
  selectedId.value = newRecord.id;
  createForm.value = { name: '', tripId: '', memberIds: [] };
}

function handleDelete(id) {
  if (!confirm('确定删除该结算单吗？')) return;
  updateRecords(props.settlementRecords.filter((s) => s.id !== id));
  if (selectedId.value === id) {
    selectedId.value = null;
  }
}

function handleStatusChange(newStatus) {
  const newRecord = settlement.updateStatus(selectedId.value, newStatus);
  applyUpdate(newRecord);
}

function handleRefreshDeposits() {
  const newRecord = settlement.refreshFromDeposits(selectedId.value);
  if (newRecord) {
    applyUpdate(newRecord);
    alert('已从押金台账同步最新数据');
  }
}

function handleMemberDeduct(memberIndex, depositIndex, value) {
  const val = Number(value);
  if (isNaN(val) || val < 0) return;
  const newRecord = settlement.setMemberDeduct(selectedId.value, memberIndex, depositIndex, val);
  applyUpdate(newRecord);
}

function handleMemberPayment(memberIndex, value) {
  const val = Number(value);
  if (isNaN(val) || val < 0) return;
  const newRecord = settlement.setMemberPayment(selectedId.value, memberIndex, val);
  applyUpdate(newRecord);
}

function handleMemberNotes(memberIndex, value) {
  const newRecord = settlement.setMemberNotes(selectedId.value, memberIndex, value);
  applyUpdate(newRecord);
}

function handleAddExpense() {
  if (!expenseForm.value.name.trim()) {
    alert('请输入费用名称');
    return;
  }
  if (!expenseForm.value.amount || Number(expenseForm.value.amount) <= 0) {
    alert('请输入有效金额');
    return;
  }
  const newRecord = settlement.addExpense(selectedId.value, {
    name: expenseForm.value.name.trim(),
    amount: String(expenseForm.value.amount),
    paidBy: expenseForm.value.paidBy
  });
  applyUpdate(newRecord);
  expenseForm.value = { name: '', amount: '', paidBy: props.currentUser || '' };
  showExpenseForm.value = false;
}

function handleRemoveExpense(expenseId) {
  if (!confirm('确定删除该费用项吗？')) return;
  const newRecord = settlement.deleteExpense(selectedId.value, expenseId);
  applyUpdate(newRecord);
}

function handleNotesChange(value) {
  const newRecord = settlement.updateInfo(selectedId.value, { notes: value });
  applyUpdate(newRecord);
}
</script>

<style scoped>
.settlement-panel { width: 100%; }
.layout { display: flex; gap: 20px; flex-wrap: wrap; }
.panel { background: #fff; border-radius: 12px; padding: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); flex: 1; min-width: 300px; }
.panel.wide { flex: 2; min-width: 400px; }
.panel h2 { margin: 0 0 12px 0; color: #2f4a2c; font-size: 18px; }
.panel h3 { margin: 0 0 12px 0; color: #2f4a2c; font-size: 16px; }
.panel label { display: block; font-size: 13px; color: #555; margin-bottom: 4px; }
.panel input, .panel select, .panel textarea { width: 100%; padding: 8px 12px; border: 1px solid #d0d8c5; border-radius: 6px; font-size: 14px; margin-bottom: 12px; box-sizing: border-box; font-family: inherit; }
.panel textarea { resize: vertical; }
.panel button[type='submit'] { width: 100%; padding: 10px 16px; background: #2f4a2c; color: #fff; border: none; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: 500; transition: background 0.2s; }
.panel button[type='submit']:hover { background: #3d5c37; }
.muted { color: #888; font-size: 12px; }
.empty-state { padding: 40px 20px; text-align: center; color: #999; }
.checkbox-list { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
.checkbox-item { display: flex; align-items: center; gap: 4px; font-size: 13px; cursor: pointer; padding: 4px 10px; border-radius: 6px; background: #f7f9f5; }
.checkbox-item:hover { background: #eef2e9; }
.auto-members { margin-bottom: 12px; }
.member-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
.member-tag { background: #eef2e9; color: #2f4a2c; padding: 4px 10px; border-radius: 6px; font-size: 13px; }
.gear-tag { background: #fef3c7; color: #92400e; padding: 4px 10px; border-radius: 6px; font-size: 12px; }
.toolbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
.toolbar h2 { margin: 0; }
.settlement-list { display: flex; flex-direction: column; gap: 12px; }
.settlement-card { border: 1px solid #e8ece4; border-radius: 10px; padding: 14px 16px; cursor: pointer; transition: all 0.15s; }
.settlement-card:hover { border-color: #2f4a2c; box-shadow: 0 2px 8px rgba(47,74,44,0.1); }
.settlement-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.settlement-header strong { font-size: 15px; color: #2f4a2c; }
.status-badge { padding: 3px 10px; border-radius: 12px; font-size: 12px; font-weight: 500; }
.status-badge.草稿 { background: #f0f4ed; color: #63705d; }
.status-badge.已确认 { background: #dbeafe; color: #1e40af; }
.status-badge.已结算 { background: #d4edda; color: #155724; }
.settlement-meta { display: flex; gap: 12px; font-size: 12px; color: #888; margin-bottom: 8px; }
.settlement-summary-row { display: flex; gap: 16px; font-size: 13px; color: #555; }
.settlement-actions { margin-top: 8px; }
.detail-header { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
.detail-header h2 { margin: 0; flex: 1; }
.detail-header-actions { display: flex; gap: 8px; align-items: center; }
.detail-header-actions select { width: auto; margin-bottom: 0; padding: 6px 10px; }
.detail-info { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }
.info-tag { background: #f7f9f5; color: #555; padding: 4px 10px; border-radius: 6px; font-size: 12px; }
.summary-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 12px; margin-bottom: 24px; }
.summary-card { background: #f7f9f5; border-radius: 10px; padding: 14px 12px; text-align: center; }
.summary-value { display: block; font-size: 22px; font-weight: 700; color: #2f4a2c; }
.summary-value.deducted { color: #c53030; }
.summary-value.extra { color: #b45309; }
.summary-value.per-member { color: #1e40af; }
.summary-label { display: block; font-size: 12px; color: #888; margin-top: 4px; }
.section-block { margin-bottom: 24px; border-top: 1px solid #eee; padding-top: 16px; }
.section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.section-header h3 { margin: 0; }
.member-settlement-list { display: flex; flex-direction: column; gap: 12px; }
.member-settlement-card { border: 1px solid #e8ece4; border-radius: 10px; padding: 14px 16px; }
.ms-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.ms-header strong { font-size: 15px; color: #2f4a2c; }
.payment-badge { padding: 3px 10px; border-radius: 12px; font-size: 12px; font-weight: 500; }
.payment-badge.未支付 { background: #fee; color: #c53030; }
.payment-badge.部分支付 { background: #fffbeb; color: #92400e; }
.payment-badge.已支付 { background: #d4edda; color: #155724; }
.ms-deposits { margin-bottom: 10px; }
.ms-sub-title { font-size: 13px; color: #555; font-weight: 600; margin-bottom: 6px; }
.ms-deposit-row { display: flex; align-items: center; gap: 10px; padding: 6px 0; font-size: 13px; border-bottom: 1px dashed #eee; flex-wrap: wrap; }
.ms-deposit-row:last-child { border-bottom: none; }
.dep-gear { font-weight: 500; min-width: 80px; }
.dep-amount { color: #63705d; }
.dep-deducted { color: #b45309; }
.dep-actual { display: flex; align-items: center; gap: 4px; margin-left: auto; }
.dep-actual label { font-size: 12px; color: #888; white-space: nowrap; }
.ms-no-deposits { font-size: 13px; margin-bottom: 8px; }
.ms-extra-share { font-size: 13px; color: #555; margin-bottom: 6px; }
.ms-total-row { font-size: 14px; margin-bottom: 8px; padding: 6px 0; border-top: 1px solid #eee; }
.ms-payment-row { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.ms-payment-row label { font-size: 13px; color: #555; white-space: nowrap; }
.ms-remain { font-size: 13px; font-weight: 500; color: #c53030; }
.ms-remain:empty { display: none; }
.ms-notes-row { margin-top: 4px; }
.small-input { width: auto; padding: 5px 8px; font-size: 13px; border: 1px solid #d0d8c5; border-radius: 4px; margin-bottom: 0; }
.small-input.full { width: 100%; }
.expense-form { background: #f7f9f5; border-radius: 8px; padding: 12px; margin-bottom: 12px; display: flex; flex-wrap: wrap; gap: 8px; align-items: flex-end; }
.expense-form-actions { display: flex; gap: 8px; }
.expense-form-actions button { padding: 6px 14px; background: #2f4a2c; color: #fff; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; }
.expense-form-actions button:hover { background: #3d5c37; }
.no-expenses { padding: 12px; text-align: center; }
.expense-list { display: flex; flex-direction: column; gap: 6px; }
.expense-row { display: flex; align-items: center; gap: 12px; padding: 8px 12px; background: #f7f9f5; border-radius: 6px; font-size: 13px; }
.exp-name { font-weight: 500; min-width: 100px; }
.exp-amount { color: #b45309; font-weight: 600; }
.exp-payer { color: #555; }
@media (max-width: 768px) {
  .layout { flex-direction: column; }
  .panel, .panel.wide { min-width: 100%; }
  .ms-deposit-row { flex-direction: column; align-items: flex-start; }
  .dep-actual { margin-left: 0; }
  .ms-payment-row { flex-wrap: wrap; }
  .settlement-summary-row { flex-direction: column; gap: 4px; }
}
</style>

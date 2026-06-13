<template>
  <div class="inventory-item-row" :class="[item.checkStatus, { 'has-abnormal': item.hasAbnormal }]">
    <div class="item-status-toggle" @click="handleToggle">
      <span class="status-icon">{{ statusIcon }}</span>
    </div>
    <div class="item-main">
      <div class="item-header">
        <strong class="item-name">{{ item.gearName }}</strong>
        <span class="item-owner">{{ item.owner }}</span>
        <span v-if="item.checker" class="item-checker">👤 {{ item.checker }}</span>
        <span v-if="item.hasAbnormal" class="abnormal-badge">⚠️ 异常</span>
        <span v-if="pendingActionCount > 0" class="pending-badge">
          待处理 {{ pendingActionCount }}
        </span>
      </div>
      <div v-if="editable && expanded" class="item-edit">
        <div class="edit-row">
          <label>盘点状态</label>
          <select :value="item.checkStatus" @change="handleStatusChange">
            <option v-for="s in statusOptions" :key="s" :value="s">{{ s }}</option>
          </select>
        </div>
        <div class="edit-row">
          <label>盘点人</label>
          <select :value="item.checker" @change="handleCheckerChange">
            <option value="">— 未指定 —</option>
            <option v-for="m in memberNames" :key="m" :value="m">{{ m }}</option>
          </select>
        </div>
        <div class="edit-row">
          <label>缺失配件</label>
          <input
            type="text"
            :value="item.missingAccessories"
            placeholder="如有缺失请填写"
            @input="handleMissingChange"
          />
        </div>
        <div class="edit-row">
          <label>备注</label>
          <textarea
            :value="item.notes"
            placeholder="盘点备注"
            rows="2"
            @input="handleNotesChange"
          ></textarea>
        </div>
        <div v-if="item.hasAbnormal" class="abnormal-section">
          <div class="abnormal-section-header">
            <label>异常处理</label>
            <button class="ghost small" @click.stop="showAddAction = !showAddAction">
              {{ showAddAction ? '收起' : '+ 添加处理' }}
            </button>
          </div>
          <div v-if="showAddAction" class="add-action-form">
            <div class="edit-row">
              <label>处理类型</label>
              <select v-model="newActionType">
                <option value="">请选择...</option>
                <option v-for="t in actionTypes" :key="t" :value="t">{{ t }}</option>
              </select>
            </div>
            <div class="edit-row">
              <label>描述</label>
              <input
                type="text"
                v-model="newActionDesc"
                placeholder="处理说明"
              />
            </div>
            <div v-if="newActionType === '押金扣除'" class="edit-row">
              <label>金额</label>
              <input
                type="number"
                v-model="newActionAmount"
                placeholder="扣除金额"
              />
            </div>
            <div class="edit-row">
              <label></label>
              <button class="small primary" @click.stop="handleAddAction">确认添加</button>
            </div>
          </div>
          <div v-if="item.abnormalActions && item.abnormalActions.length > 0" class="action-list">
            <div
              v-for="action in item.abnormalActions"
              :key="action.id"
              class="action-item"
              :class="action.status"
            >
              <div class="action-info">
                <span class="action-type">{{ action.type }}</span>
                <span class="action-status">{{ action.status }}</span>
              </div>
              <p v-if="action.description" class="action-desc">{{ action.description }}</p>
              <div class="action-meta">
                <span v-if="action.amount && Number(action.amount) > 0">¥{{ action.amount }}</span>
                <span v-if="action.handler">操作人：{{ action.handler }}</span>
              </div>
              <div class="action-ops">
                <select
                  :value="action.status"
                  @change="handleActionStatusChange(action.id, $event.target.value)"
                >
                  <option v-for="s in actionStatuses" :key="s" :value="s">{{ s }}</option>
                </select>
                <button class="ghost small danger" @click.stop="handleRemoveAction(action.id)">删除</button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div v-if="!editable || !expanded" class="item-summary">
        <span v-if="item.missingAccessories" class="missing-tag">
          🔧 缺失：{{ item.missingAccessories }}
        </span>
        <span v-if="item.notes" class="notes-text">📝 {{ item.notes }}</span>
        <span v-if="pendingActionCount > 0" class="pending-text">
          ⏳ {{ pendingActionCount }} 项待处理
        </span>
      </div>
    </div>
    <div class="item-actions">
      <button v-if="editable" class="ghost small" @click.stop="toggleExpand">
        {{ expanded ? '收起' : '详情' }}
      </button>
      <button v-if="editable && removable" class="ghost small danger" @click.stop="handleRemove">
        移除
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';

const props = defineProps({
  item: {
    type: Object,
    required: true
  },
  members: {
    type: Array,
    default: () => []
  },
  editable: {
    type: Boolean,
    default: true
  },
  removable: {
    type: Boolean,
    default: true
  }
});

const emit = defineEmits(['toggle-status', 'update-item', 'remove', 'add-action', 'update-action', 'remove-action']);

const expanded = ref(false);
const showAddAction = ref(false);
const newActionType = ref('');
const newActionDesc = ref('');
const newActionAmount = ref('');

const statusOptions = ['待盘点', '已盘点', '缺失'];
const actionTypes = ['装备损耗', '保养记录', '押金扣除'];
const actionStatuses = ['待处理', '已处理', '已取消'];

const memberNames = computed(() => props.members.map((m) => m.nickname).filter(Boolean));

const pendingActionCount = computed(() => {
  if (!props.item.abnormalActions) return 0;
  return props.item.abnormalActions.filter((a) => a.status === '待处理').length;
});

const statusIcon = computed(() => {
  switch (props.item.checkStatus) {
    case '已盘点': return '✅';
    case '缺失': return '❌';
    default: return '⭕';
  }
});

function toggleExpand() {
  expanded.value = !expanded.value;
}

function handleToggle() {
  emit('toggle-status');
}

function handleStatusChange(e) {
  emit('update-item', { checkStatus: e.target.value });
}

function handleCheckerChange(e) {
  emit('update-item', { checker: e.target.value });
}

function handleMissingChange(e) {
  emit('update-item', { missingAccessories: e.target.value });
}

function handleNotesChange(e) {
  emit('update-item', { notes: e.target.value });
}

function handleAddAction() {
  if (!newActionType.value) {
    alert('请选择处理类型');
    return;
  }
  emit('add-action', {
    type: newActionType.value,
    description: newActionDesc.value,
    amount: newActionAmount.value || '0'
  });
  newActionType.value = '';
  newActionDesc.value = '';
  newActionAmount.value = '';
  showAddAction.value = false;
}

function handleActionStatusChange(actionId, status) {
  emit('update-action', actionId, { status });
}

function handleRemoveAction(actionId) {
  if (confirm('确定删除该处理记录吗？')) {
    emit('remove-action', actionId);
  }
}

function handleRemove() {
  if (confirm('确定从盘点单中移除该装备吗？')) {
    emit('remove');
  }
}
</script>

<style scoped>
.inventory-item-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px;
  background: #fff;
  border: 1px solid #e0e5d8;
  border-radius: 8px;
  transition: all 0.2s;
}

.inventory-item-row:hover {
  border-color: #b5c4a3;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
}

.inventory-item-row.已盘点 {
  background: #f0f7ed;
  border-color: #b8d4a8;
}

.inventory-item-row.缺失 {
  background: #fff5f5;
  border-color: #e8b4b4;
}

.inventory-item-row.has-abnormal {
  border-left: 2px solid #e8a830;
}

.item-status-toggle {
  flex-shrink: 0;
  cursor: pointer;
  padding: 4px;
  border-radius: 6px;
  transition: background 0.2s;
}

.item-status-toggle:hover {
  background: rgba(0, 0, 0, 0.05);
}

.status-icon {
  font-size: 20px;
  display: block;
}

.item-main {
  flex: 1;
  min-width: 0;
}

.item-header {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 4px;
}

.item-name {
  font-size: 14px;
  color: #2f4a2c;
}

.item-owner {
  font-size: 12px;
  color: #888;
}

.item-checker {
  font-size: 12px;
  color: #5a7a4f;
  background: #f0f5ea;
  padding: 2px 8px;
  border-radius: 10px;
}

.item-edit {
  margin-top: 8px;
  padding: 8px;
  background: #fafcf7;
  border-radius: 6px;
}

.edit-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.edit-row:last-child {
  margin-bottom: 0;
}

.edit-row label {
  flex-shrink: 0;
  width: 70px;
  font-size: 12px;
  color: #666;
}

.edit-row select,
.edit-row input,
.edit-row textarea {
  flex: 1;
  padding: 6px 10px;
  border: 1px solid #d0d8c5;
  border-radius: 6px;
  font-size: 13px;
  font-family: inherit;
}

.edit-row textarea {
  resize: vertical;
}

.item-summary {
  font-size: 12px;
  color: #666;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.missing-tag {
  color: #c53030;
}

.notes-text {
  color: #888;
}

.item-actions {
  flex-shrink: 0;
  display: flex;
  gap: 6px;
}

.abnormal-badge {
  font-size: 11px;
  padding: 2px 8px;
  background: #fff3e0;
  color: #e89028;
  border-radius: 10px;
  font-weight: 500;
}

.pending-badge {
  font-size: 11px;
  padding: 2px 8px;
  background: #fff0e0;
  color: #e87028;
  border-radius: 10px;
  font-weight: 500;
}

.pending-text {
  color: #e87028;
  font-size: 12px;
}

.abnormal-section {
  margin-top: 12px;
  padding: 10px;
  background: #fffaf2;
  border: 1px solid #f0e0c0;
  border-radius: 6px;
}

.abnormal-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.abnormal-section-header label {
  font-size: 12px;
  color: #666;
  font-weight: 500;
}

.add-action-form {
  padding: 8px;
  background: #fff7e8;
  border-radius: 6px;
  margin-bottom: 8px;
}

.action-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.action-item {
  padding: 8px 10px;
  background: #fff;
  border: 1px solid #e8dcc0;
  border-radius: 6px;
}

.action-item.已处理 {
  background: #f0f7ed;
  border-color: #c0d8b0;
}

.action-item.已取消 {
  background: #f5f5f5;
  border-color: #e0e0e0;
  opacity: 0.7;
}

.action-info {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.action-type {
  font-size: 13px;
  font-weight: 600;
  color: #3a3730;
}

.action-status {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 8px;
  background: #fff0e0;
  color: #e87028;
}

.action-item.已处理 .action-status {
  background: #e0f0d8;
  color: #2f7a3a;
}

.action-item.已取消 .action-status {
  background: #e8e8e8;
  color: #888;
}

.action-desc {
  margin: 0 0 4px 0;
  font-size: 12px;
  color: #666;
}

.action-meta {
  display: flex;
  gap: 12px;
  font-size: 11px;
  color: #888;
  margin-bottom: 6px;
}

.action-ops {
  display: flex;
  gap: 6px;
  align-items: center;
}

.action-ops select {
  flex: 1;
  padding: 4px 8px;
  border: 1px solid #d0d8c5;
  border-radius: 4px;
  font-size: 12px;
}

button.primary {
  background: #2f4a2c;
  color: #fff;
  border: none;
  padding: 6px 14px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
}

button.primary:hover {
  background: #3d5c37;
}
</style>

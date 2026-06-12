<template>
  <div class="inventory-item-row" :class="item.checkStatus">
    <div class="item-status-toggle" @click="handleToggle">
      <span class="status-icon">{{ statusIcon }}</span>
    </div>
    <div class="item-main">
      <div class="item-header">
        <strong class="item-name">{{ item.gearName }}</strong>
        <span class="item-owner">{{ item.owner }}</span>
        <span v-if="item.checker" class="item-checker">👤 {{ item.checker }}</span>
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
      </div>
      <div v-if="!editable || !expanded" class="item-summary">
        <span v-if="item.missingAccessories" class="missing-tag">
          🔧 缺失：{{ item.missingAccessories }}
        </span>
        <span v-if="item.notes" class="notes-text">📝 {{ item.notes }}</span>
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

const emit = defineEmits(['toggle-status', 'update-item', 'remove']);

const expanded = ref(false);

const statusOptions = ['待盘点', '已盘点', '缺失'];

const memberNames = computed(() => props.members.map((m) => m.nickname).filter(Boolean));

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
</style>

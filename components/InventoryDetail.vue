<template>
  <div class="inventory-detail">
    <div class="detail-header">
      <div class="header-info">
        <h2>{{ inventory.name }}</h2>
        <div class="header-meta">
          <span class="type-badge" :class="inventory.type">{{ inventory.type }}</span>
          <span class="status-badge" :class="inventory.status">{{ inventory.status }}</span>
          <span class="meta-item">📅 {{ inventory.date }}</span>
          <span v-if="inventory.checker" class="meta-item">👤 {{ inventory.checker }}</span>
          <span v-if="inventory.tripName" class="meta-item">🗺 {{ inventory.tripName }}</span>
        </div>
      </div>
      <div class="header-actions">
        <button v-if="inventory.status === '进行中'" class="ghost small" @click="handleComplete">
          标记完成
        </button>
        <button v-else class="ghost small" @click="handleReopen">
          重新打开
        </button>
        <button class="ghost small" @click="$emit('back')">
          返回列表
        </button>
      </div>
    </div>

    <div class="progress-section">
      <div class="progress-bar-wrapper">
        <div class="progress-bar" :style="{ width: stats.progress + '%' }"></div>
      </div>
      <div class="progress-stats">
        <span>共 {{ stats.total }} 件</span>
        <span class="checked">✅ 已盘点 {{ stats.checked }}</span>
        <span class="pending">⭕ 待盘点 {{ stats.pending }}</span>
        <span class="missing">❌ 缺失 {{ stats.missing }}</span>
        <span class="progress-text">{{ stats.progress }}%</span>
      </div>
    </div>

    <div v-if="inventory.notes" class="notes-section">
      <label class="section-label">盘点备注</label>
      <p v-if="!editingNotes" class="notes-text" @click="startEditNotes">{{ inventory.notes || '点击添加备注' }}</p>
      <div v-else class="notes-edit">
        <textarea v-model="notesDraft" rows="3" placeholder="填写盘点备注"></textarea>
        <div class="notes-actions">
          <button class="small" @click="saveNotes">保存</button>
          <button class="ghost small" @click="cancelEditNotes">取消</button>
        </div>
      </div>
    </div>

    <div v-if="inventory.status === '进行中'" class="add-gear-section">
      <label class="section-label">添加装备</label>
      <div class="add-gear-row">
        <select v-model="selectedTripId" @change="handleAddFromTrip">
          <option value="">从出行清单添加...</option>
          <option v-for="trip in trips" :key="trip.id" :value="trip.id">
            {{ trip.destination }} ({{ trip.gears.length }}件装备)
          </option>
        </select>
        <select v-model="selectedGearId" @change="handleAddSingleGear">
          <option value="">手动添加装备...</option>
          <option v-for="gear in availableGears" :key="gear.id" :value="gear.id">
            {{ gear.name }} · {{ gear.owner }}
          </option>
        </select>
      </div>
    </div>

    <div class="items-section">
      <div class="section-header">
        <h3>盘点明细</h3>
        <div class="filter-buttons">
          <button
            v-for="f in filterOptions"
            :key="f.value"
            :class="['ghost small', { active: currentFilter === f.value }]"
            @click="currentFilter = f.value"
          >
            {{ f.label }}
          </button>
        </div>
      </div>

      <div v-if="filteredItems.length === 0" class="empty-state">
        <p>暂无盘点项</p>
      </div>

      <div v-else class="items-list">
        <InventoryItemRow
          v-for="item in filteredItems"
          :key="item.id"
          :item="item"
          :editable="inventory.status === '进行中'"
          @toggle-status="handleToggleItem(item.id)"
          @update-item="(updates) => handleUpdateItem(item.id, updates)"
          @remove="handleRemoveItem(item.id)"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import InventoryItemRow from './InventoryItemRow.vue';
import { getInventoryStats } from '../utils/inventoryTransform.js';

const props = defineProps({
  inventory: {
    type: Object,
    required: true
  },
  gears: {
    type: Array,
    default: () => []
  },
  trips: {
    type: Array,
    default: () => []
  }
});

const emit = defineEmits([
  'back',
  'toggle-item',
  'update-item',
  'remove-item',
  'add-gear',
  'add-gears-from-trip',
  'complete',
  'reopen',
  'update-notes'
]);

const currentFilter = ref('全部');
const selectedGearId = ref('');
const selectedTripId = ref('');
const editingNotes = ref(false);
const notesDraft = ref('');

const filterOptions = [
  { value: '全部', label: '全部' },
  { value: '待盘点', label: '待盘点' },
  { value: '已盘点', label: '已盘点' },
  { value: '缺失', label: '缺失' }
];

const stats = computed(() => getInventoryStats(props.inventory));

const existingGearIds = computed(() =>
  new Set(props.inventory.items.map((i) => i.gearId).filter(Boolean))
);

const availableGears = computed(() =>
  props.gears.filter((g) => !existingGearIds.value.has(g.id))
);

const filteredItems = computed(() => {
  if (currentFilter.value === '全部') return props.inventory.items;
  return props.inventory.items.filter((i) => i.checkStatus === currentFilter.value);
});

function handleToggleItem(itemId) {
  emit('toggle-item', itemId);
}

function handleUpdateItem(itemId, updates) {
  emit('update-item', itemId, updates);
}

function handleRemoveItem(itemId) {
  emit('remove-item', itemId);
}

function handleAddSingleGear() {
  if (!selectedGearId.value) return;
  emit('add-gear', selectedGearId.value);
  selectedGearId.value = '';
}

function handleAddFromTrip() {
  if (!selectedTripId.value) return;
  emit('add-gears-from-trip', selectedTripId.value);
  selectedTripId.value = '';
}

function handleComplete() {
  if (confirm('确定将该盘点单标记为已完成吗？')) {
    emit('complete');
  }
}

function handleReopen() {
  if (confirm('确定重新打开该盘点单吗？')) {
    emit('reopen');
  }
}

function startEditNotes() {
  notesDraft.value = props.inventory.notes || '';
  editingNotes.value = true;
}

function saveNotes() {
  emit('update-notes', notesDraft.value);
  editingNotes.value = false;
}

function cancelEditNotes() {
  editingNotes.value = false;
  notesDraft.value = '';
}
</script>

<style scoped>
.inventory-detail {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.detail-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 12px;
}

.header-info h2 {
  margin: 0 0 8px 0;
  color: #2f4a2c;
  font-size: 20px;
}

.header-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}

.type-badge {
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
}

.type-badge.出行前 {
  background: #e6f0ff;
  color: #2c5a8a;
}

.type-badge.出行后 {
  background: #fff4e6;
  color: #8a5a2c;
}

.status-badge {
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
}

.status-badge.进行中 {
  background: #fff7e6;
  color: #8a6a2c;
}

.status-badge.已完成 {
  background: #e6f7ed;
  color: #2c8a5a;
}

.meta-item {
  font-size: 13px;
  color: #666;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.progress-section {
  padding: 16px;
  background: #f7f9f5;
  border-radius: 10px;
}

.progress-bar-wrapper {
  height: 8px;
  background: #e0e5d8;
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 10px;
}

.progress-bar {
  height: 100%;
  background: linear-gradient(90deg, #5a8f3d, #7cb342);
  border-radius: 4px;
  transition: width 0.3s;
}

.progress-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  font-size: 13px;
  color: #555;
}

.progress-stats .checked {
  color: #2f7a3a;
}

.progress-stats .pending {
  color: #8a6a2c;
}

.progress-stats .missing {
  color: #b02a2a;
}

.progress-text {
  margin-left: auto;
  font-weight: 600;
  color: #2f4a2c;
}

.section-label {
  display: block;
  font-size: 13px;
  color: #555;
  font-weight: 500;
  margin-bottom: 8px;
}

.notes-section {
  padding: 16px;
  background: #fff;
  border: 1px solid #e0e5d8;
  border-radius: 10px;
}

.notes-text {
  margin: 0;
  padding: 8px 12px;
  background: #f7f9f5;
  border-radius: 6px;
  font-size: 13px;
  color: #444;
  cursor: pointer;
  min-height: 36px;
}

.notes-edit textarea {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #d0d8c5;
  border-radius: 6px;
  font-size: 13px;
  font-family: inherit;
  resize: vertical;
  box-sizing: border-box;
}

.notes-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.add-gear-section {
  padding: 16px;
  background: #fff;
  border: 1px solid #e0e5d8;
  border-radius: 10px;
}

.add-gear-row {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.add-gear-row select {
  flex: 1;
  min-width: 200px;
  padding: 8px 12px;
  border: 1px solid #d0d8c5;
  border-radius: 6px;
  font-size: 13px;
}

.items-section {
  background: #fff;
  border: 1px solid #e0e5d8;
  border-radius: 10px;
  padding: 16px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  flex-wrap: wrap;
  gap: 8px;
}

.section-header h3 {
  margin: 0;
  color: #2f4a2c;
  font-size: 16px;
}

.filter-buttons {
  display: flex;
  gap: 4px;
}

.filter-buttons .active {
  background: #2f4a2c;
  color: #fff;
}

.empty-state {
  padding: 40px 20px;
  text-align: center;
  color: #999;
}

.items-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

@media (max-width: 768px) {
  .add-gear-row select {
    min-width: 100%;
  }
}
</style>

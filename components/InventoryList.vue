<template>
  <div class="inventory-list">
    <div class="list-toolbar">
      <h2>盘点单列表</h2>
      <div class="filter-group">
        <select v-model="typeFilter">
          <option value="全部类型">全部类型</option>
          <option value="出行前">出行前</option>
          <option value="出行后">出行后</option>
        </select>
        <select v-model="statusFilter">
          <option value="全部状态">全部状态</option>
          <option value="进行中">进行中</option>
          <option value="已完成">已完成</option>
        </select>
      </div>
    </div>

    <div v-if="filteredLists.length === 0" class="empty-state">
      <div class="empty-icon">📋</div>
      <h3>暂无盘点单</h3>
      <p>点击「新建盘点单」开始创建你的第一个盘点单</p>
    </div>

    <div v-else class="lists-grid">
      <article
        v-for="list in filteredLists"
        :key="list.id"
        class="inventory-card"
        @click="$emit('select', list.id)"
      >
        <div class="card-header">
          <strong class="card-title">{{ list.name }}</strong>
          <span class="type-badge" :class="list.type">{{ list.type }}</span>
        </div>
        <div class="card-meta">
          <span v-if="list.tripName" class="meta-item">🗺 {{ list.tripName }}</span>
          <span class="meta-item">📅 {{ list.date }}</span>
          <span v-if="list.checker" class="meta-item">👤 {{ list.checker }}</span>
        </div>
        <div class="card-progress">
          <div class="progress-bar-mini">
            <div class="progress-fill" :style="{ width: getStats(list).progress + '%' }"></div>
          </div>
          <span class="progress-label">{{ getStats(list).progress }}%</span>
        </div>
        <div class="card-stats">
          <span class="stat">共 {{ getStats(list).total }} 件</span>
          <span class="stat checked">✅ {{ getStats(list).checked }}</span>
          <span class="stat missing">❌ {{ getStats(list).missing }}</span>
        </div>
        <div class="card-footer">
          <span :class="['status-tag', list.status]">{{ list.status }}</span>
          <button class="ghost small" @click.stop="$emit('select', list.id)">
            查看详情 →
          </button>
        </div>
      </article>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { getInventoryStats } from '../utils/inventoryTransform.js';

const props = defineProps({
  lists: {
    type: Array,
    default: () => []
  }
});

defineEmits(['select']);

const typeFilter = ref('全部类型');
const statusFilter = ref('全部状态');

const filteredLists = computed(() => {
  return props.lists.filter((list) => {
    const typeMatch = typeFilter.value === '全部类型' || list.type === typeFilter.value;
    const statusMatch = statusFilter.value === '全部状态' || list.status === statusFilter.value;
    return typeMatch && statusMatch;
  });
});

function getStats(list) {
  return getInventoryStats(list);
}
</script>

<style scoped>
.inventory-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.list-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}

.list-toolbar h2 {
  margin: 0;
  color: #2f4a2c;
  font-size: 18px;
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

.empty-state {
  padding: 60px 20px;
  text-align: center;
  background: #f7f9f5;
  border-radius: 12px;
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 12px;
}

.empty-state h3 {
  margin: 0 0 8px 0;
  color: #2f4a2c;
}

.empty-state p {
  margin: 0;
  color: #888;
  font-size: 13px;
}

.lists-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
}

.inventory-card {
  background: #fff;
  border: 1px solid #e0e5d8;
  border-radius: 10px;
  padding: 16px;
  cursor: pointer;
  transition: all 0.2s;
}

.inventory-card:hover {
  border-color: #b5c4a3;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  transform: translateY(-2px);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 10px;
  gap: 8px;
}

.card-title {
  font-size: 15px;
  color: #2f4a2c;
  flex: 1;
}

.type-badge {
  flex-shrink: 0;
  padding: 3px 8px;
  border-radius: 10px;
  font-size: 11px;
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

.card-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 12px;
}

.meta-item {
  font-size: 12px;
  color: #666;
}

.card-progress {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.progress-bar-mini {
  flex: 1;
  height: 6px;
  background: #e0e5d8;
  border-radius: 3px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #5a8f3d, #7cb342);
  border-radius: 3px;
  transition: width 0.3s;
}

.progress-label {
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 600;
  color: #2f4a2c;
}

.card-stats {
  display: flex;
  gap: 12px;
  margin-bottom: 12px;
  font-size: 12px;
  color: #666;
}

.stat.checked {
  color: #2f7a3a;
}

.stat.missing {
  color: #b02a2a;
}

.card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 10px;
  border-top: 1px solid #f0f2ec;
}

.status-tag {
  padding: 3px 10px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 500;
}

.status-tag.进行中 {
  background: #fff7e6;
  color: #8a6a2c;
}

.status-tag.已完成 {
  background: #e6f7ed;
  color: #2c8a5a;
}

@media (max-width: 600px) {
  .lists-grid {
    grid-template-columns: 1fr;
  }
}
</style>

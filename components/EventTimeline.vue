<template>
  <section class="event-timeline">
    <div class="panel">
      <div class="panel-header">
        <h2>📋 操作时间线</h2>
        <div class="stats-row" v-if="stats.total > 0">
          <span class="stat-item">共 {{ stats.total }} 条记录</span>
        </div>
      </div>

      <div class="filters">
        <div class="filter-group">
          <label>筛选类型：</label>
          <div class="filter-chips">
            <span
              v-for="(label, key) in entityTypeOptions"
              :key="key"
              class="filter-chip"
              :class="{ active: selectedEntityTypes.includes(key) }"
              @click="toggleEntityType(key)"
            >
              {{ label }}
            </span>
          </div>
        </div>

        <div class="filter-group">
          <label>操作人：</label>
          <select v-model="selectedActor" class="filter-select">
            <option value="">全部</option>
            <option v-for="actor in actorOptions" :key="actor" :value="actor">
              {{ actor }}
            </option>
          </select>
        </div>

        <div class="filter-group">
          <label>搜索：</label>
          <input
            v-model="searchText"
            type="text"
            class="filter-input"
            placeholder="搜索操作对象或备注..."
          />
        </div>
      </div>

      <div class="timeline-container" v-if="filteredEvents.length > 0">
        <div class="timeline">
          <div
            v-for="(event, index) in filteredEvents"
            :key="event.id"
            class="timeline-item"
            :class="{ 'imported': event.isImported }"
          >
            <div class="timeline-dot" :class="'dot-' + event.entityType">
              {{ getEntityIcon(event.entityType) }}
            </div>
            <div class="timeline-content">
              <div class="timeline-header">
                <span class="event-entity">
                  {{ getEntityLabel(event.entityType) }}
                  <span class="entity-name" v-if="event.entityName">
                    「{{ event.entityName }}」
                  </span>
                </span>
                <span class="event-action" :class="'action-' + event.action">
                  {{ getActionLabel(event.action) }}
                </span>
              </div>

              <div class="timeline-meta">
                <span class="meta-time">{{ formatTime(event.timestamp) }}</span>
                <span class="meta-actor" v-if="event.actor">操作人：{{ event.actor }}</span>
                <span class="meta-source" v-if="event.sourcePage">来源：{{ event.sourcePage }}</span>
                <span class="meta-imported" v-if="event.isImported">（导入数据）</span>
              </div>

              <div class="timeline-changes" v-if="event.changes && event.changes.length > 0">
                <div
                  v-for="change in event.changes"
                  :key="change.field"
                  class="change-item"
                >
                  <span class="change-label">{{ change.label }}：</span>
                  <span class="change-before" v-if="change.before">{{ change.before }}</span>
                  <span class="change-arrow" v-if="change.before && change.after"> → </span>
                  <span class="change-after" v-if="change.after">{{ change.after }}</span>
                  <span class="change-after" v-else-if="!change.before && !change.after">（空）</span>
                </div>
              </div>

              <div class="timeline-related" v-if="event.relatedEntityName">
                关联：{{ getEntityLabel(event.relatedEntityType) }}「{{ event.relatedEntityName }}」
              </div>

              <div class="timeline-notes" v-if="event.notes">
                备注：{{ event.notes }}
              </div>
            </div>
          </div>
        </div>

        <div class="load-more" v-if="hasMore" @click="loadMore">
          加载更多
        </div>
      </div>

      <div class="empty-state" v-else>
        <div class="empty-icon">📭</div>
        <p>暂无操作记录</p>
        <p class="empty-desc">执行操作后会自动记录在此</p>
      </div>
    </div>
  </section>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { EVENT_ENTITY_TYPES, EVENT_ACTIONS, useEventLog } from '../composables/useEventLog.js';

const props = defineProps({
  eventLogs: {
    type: Array,
    default: () => []
  },
  currentUser: {
    type: String,
    default: ''
  }
});

const emit = defineEmits([]);

const PAGE_SIZE = 50;

const selectedEntityTypes = ref([]);
const selectedActor = ref('');
const searchText = ref('');
const displayCount = ref(PAGE_SIZE);

const eventLogRef = computed(() => ({ value: props.eventLogs || [] }));
const currentUserRef = computed(() => props.currentUser);

const { filterEvents, getEventStats } = useEventLog({
  eventLogs: eventLogRef,
  currentUser: currentUserRef
});

const stats = computed(() => getEventStats());

const entityTypeOptions = EVENT_ENTITY_TYPES;

const actorOptions = computed(() => {
  const actors = new Set();
  for (const e of props.eventLogs || []) {
    if (e.actor) actors.add(e.actor);
  }
  return Array.from(actors).sort();
});

const filteredEvents = computed(() => {
  const result = filterEvents({
    entityTypes: selectedEntityTypes.value.length > 0 ? selectedEntityTypes.value : [],
    actor: selectedActor.value,
    searchText: searchText.value
  });
  return result.slice(0, displayCount.value);
});

const hasMore = computed(() => {
  const all = filterEvents({
    entityTypes: selectedEntityTypes.value.length > 0 ? selectedEntityTypes.value : [],
    actor: selectedActor.value,
    searchText: searchText.value
  });
  return all.length > displayCount.value;
});

function toggleEntityType(type) {
  const idx = selectedEntityTypes.value.indexOf(type);
  if (idx > -1) {
    selectedEntityTypes.value.splice(idx, 1);
  } else {
    selectedEntityTypes.value.push(type);
  }
  displayCount.value = PAGE_SIZE;
}

function loadMore() {
  displayCount.value += PAGE_SIZE;
}

function getEntityIcon(type) {
  const icons = {
    member: '👤',
    gear: '🎒',
    request: '📝',
    handover: '🤝',
    deposit: '💰',
    settlement: '🧾',
    inventory: '📋',
    reservation: '⏳',
    trip: '🏕️',
    maintenance: '🔧',
    space: '🏠'
  };
  return icons[type] || '📌';
}

function getEntityLabel(type) {
  return EVENT_ENTITY_TYPES[type] || type;
}

function getActionLabel(action) {
  return EVENT_ACTIONS[action] || action;
}

function formatTime(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return isoString;
  const now = new Date();
  const diff = now - date;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  if (hours < 24) return `${hours} 小时前`;
  if (days < 7) return `${days} 天前`;

  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d} ${hh}:${mm}`;
}

watch([selectedEntityTypes, selectedActor, searchText], () => {
  displayCount.value = PAGE_SIZE;
});
</script>

<style scoped>
.event-timeline {
  width: 100%;
}

.panel {
  background: #fff;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.panel-header h2 {
  margin: 0;
  color: #2f4a2c;
  font-size: 18px;
}

.stats-row {
  display: flex;
  gap: 12px;
}

.stat-item {
  font-size: 13px;
  color: #666;
  background: #f5f7f2;
  padding: 4px 10px;
  border-radius: 6px;
}

.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin-bottom: 20px;
  padding-bottom: 16px;
  border-bottom: 1px solid #eee;
}

.filter-group {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #555;
}

.filter-group label {
  font-weight: 500;
  white-space: nowrap;
}

.filter-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.filter-chip {
  padding: 4px 10px;
  border-radius: 6px;
  background: #f5f7f2;
  cursor: pointer;
  font-size: 12px;
  color: #555;
  transition: all 0.2s;
  user-select: none;
}

.filter-chip:hover {
  background: #e8ede3;
}

.filter-chip.active {
  background: #2f4a2c;
  color: #fff;
}

.filter-select,
.filter-input {
  padding: 6px 10px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 13px;
  background: #fff;
}

.filter-input {
  min-width: 180px;
}

.timeline-container {
  max-height: 600px;
  overflow-y: auto;
}

.timeline {
  position: relative;
  padding-left: 28px;
}

.timeline::before {
  content: '';
  position: absolute;
  left: 10px;
  top: 8px;
  bottom: 8px;
  width: 2px;
  background: #e0e6da;
}

.timeline-item {
  position: relative;
  margin-bottom: 16px;
}

.timeline-item.imported .timeline-content {
  opacity: 0.7;
  background: #fafafa;
}

.timeline-dot {
  position: absolute;
  left: -28px;
  top: 4px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #fff;
  border: 2px solid #ccc;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  z-index: 1;
}

.dot-member { border-color: #4a90d9; }
.dot-gear { border-color: #2f4a2c; }
.dot-request { border-color: #e6a23c; }
.dot-handover { border-color: #9b59b6; }
.dot-deposit { border-color: #f39c12; }
.dot-settlement { border-color: #16a085; }
.dot-inventory { border-color: #3498db; }
.dot-reservation { border-color: #e74c3c; }
.dot-trip { border-color: #27ae60; }
.dot-maintenance { border-color: #95a5a6; }
.dot-space { border-color: #8e44ad; }

.timeline-content {
  background: #f9faf7;
  border-radius: 8px;
  padding: 12px 14px;
  transition: background 0.2s;
}

.timeline-content:hover {
  background: #f0f4ec;
}

.timeline-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
  flex-wrap: wrap;
  gap: 8px;
}

.event-entity {
  font-weight: 600;
  color: #333;
  font-size: 14px;
}

.entity-name {
  color: #2f4a2c;
  font-weight: 500;
}

.event-action {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: 500;
}

.action-create { background: #d4edda; color: #155724; }
.action-update { background: #fff3cd; color: #856404; }
.action-delete { background: #f8d7da; color: #721c24; }
.action-rename { background: #d1ecf1; color: #0c5460; }
.action-confirm { background: #d4edda; color: #155724; }
.action-approve { background: #d4edda; color: #155724; }
.action-reject { background: #f8d7da; color: #721c24; }
.action-activate { background: #d4edda; color: #155724; }
.action-cancel { background: #f8d7da; color: #721c24; }
.action-complete { background: #d4edda; color: #155724; }
.action-settle { background: #d1ecf1; color: #0c5460; }
.action-deduct { background: #f8d7da; color: #721c24; }
.action-refund { background: #d1ecf1; color: #0c5460; }
.action-borrow { background: #fff3cd; color: #856404; }
.action-return { background: #d4edda; color: #155724; }
.action-import { background: #e2e3e5; color: #383d41; }
.action-export { background: #e2e3e5; color: #383d41; }
.action-reset { background: #f8d7da; color: #721c24; }

.timeline-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  font-size: 12px;
  color: #888;
  margin-bottom: 8px;
}

.meta-imported {
  color: #aaa;
  font-style: italic;
}

.timeline-changes {
  background: #fff;
  border-radius: 6px;
  padding: 8px 12px;
  margin-bottom: 8px;
}

.change-item {
  font-size: 12px;
  color: #555;
  line-height: 1.6;
}

.change-label {
  color: #777;
  font-weight: 500;
}

.change-before {
  color: #e74c3c;
  text-decoration: line-through;
}

.change-arrow {
  color: #999;
  margin: 0 4px;
}

.change-after {
  color: #27ae60;
  font-weight: 500;
}

.timeline-related {
  font-size: 12px;
  color: #666;
  margin-bottom: 4px;
}

.timeline-notes {
  font-size: 12px;
  color: #666;
  font-style: italic;
}

.load-more {
  text-align: center;
  padding: 12px;
  color: #2f4a2c;
  font-size: 13px;
  cursor: pointer;
  border-top: 1px solid #eee;
  margin-top: 8px;
}

.load-more:hover {
  background: #f5f7f2;
}

.empty-state {
  text-align: center;
  padding: 40px 20px;
  color: #999;
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 12px;
}

.empty-state p {
  margin: 4px 0;
  font-size: 14px;
}

.empty-desc {
  font-size: 12px;
  color: #bbb;
}

@media (max-width: 768px) {
  .filters {
    flex-direction: column;
    align-items: stretch;
  }

  .filter-group {
    flex-wrap: wrap;
  }

  .timeline-container {
    max-height: 500px;
  }
}
</style>

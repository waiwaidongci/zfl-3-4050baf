<template>
  <div class="equipment-health-profile">
    <div class="profile-header">
      <button class="close-btn ghost" @click="$emit('close')">✕ 关闭档案</button>
      <button class="timeline-btn ghost" @click="$emit('view-timeline', gearId)">📋 查看时间线</button>
    </div>

    <div v-if="!gear" class="profile-empty">
      <p class="muted">未找到装备信息</p>
    </div>

    <template v-else>
      <section class="profile-hero">
        <div class="hero-main">
          <div class="gear-icon">{{ getCategoryIcon(gear.category) }}</div>
          <div class="hero-info">
            <h2 class="gear-name">{{ gear.name }}</h2>
            <div class="gear-meta">
              <span class="meta-chip">{{ gear.category }}</span>
              <span class="meta-chip owner">🔑 {{ gear.owner }}</span>
              <span :class="['meta-chip status', gear.status]">{{ gear.status }}</span>
            </div>
            <p v-if="gear.notes" class="gear-notes">{{ gear.notes }}</p>
          </div>
        </div>
        <div class="hero-score">
          <div class="score-ring" :style="{ '--score-color': healthLevel.color }">
            <svg viewBox="0 0 120 120" class="score-svg">
              <circle class="score-bg" cx="60" cy="60" r="50" />
              <circle
                class="score-fg"
                cx="60" cy="60" r="50"
                :style="{
                  strokeDasharray: `${overallHealthScore * 3.14} 314`,
                  stroke: healthLevel.color
                }"
              />
            </svg>
            <div class="score-text">
              <span class="score-num" :style="{ color: healthLevel.color }">{{ overallHealthScore }}</span>
              <span class="score-label">{{ healthLevel.label }}</span>
            </div>
          </div>
        </div>
      </section>

      <section v-if="riskTags.length > 0" class="risk-section">
        <h3 class="section-title">
          <span>🚩 风险标签</span>
          <span class="title-hint muted">共 {{ riskTags.length }} 项</span>
        </h3>
        <div class="risk-tags">
          <span
            v-for="tag in riskTags"
            :key="tag.key"
            :class="['risk-tag', tag.level]"
          >
            <span class="tag-icon">{{ tag.icon }}</span>
            {{ tag.label }}
          </span>
        </div>
      </section>

      <section class="stats-section">
        <h3 class="section-title">📊 使用统计</h3>
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-num big">{{ borrowCount }}</div>
            <div class="stat-label">累计借用次数</div>
          </div>
          <div class="stat-card">
            <div class="stat-num">
              <template v-if="lastMaintenance">
                {{ lastMaintenance.date }}
                <div class="stat-sub muted">
                  {{ daysSinceLastMaintenance }} 天前 · {{ lastMaintenance.type }}
                </div>
              </template>
              <template v-else>
                <span class="muted">暂无</span>
              </template>
            </div>
            <div class="stat-label">最近一次保养</div>
          </div>
          <div class="stat-card" :class="{ 'plan-overdue': maintenancePlanStatus?.status === 'overdue', 'plan-upcoming': maintenancePlanStatus?.status === 'upcoming' }">
            <div class="stat-num">
              <template v-if="maintenancePlanStatus?.nextDate">
                {{ maintenancePlanStatus.nextDate }}
                <div class="stat-sub" :class="maintenancePlanStatus.status === 'overdue' ? 'danger' : maintenancePlanStatus.status === 'upcoming' ? 'warning' : 'muted'">
                  {{ maintenancePlanStatus.label }} · {{ maintenancePlanStatus.cycle }}天周期 · {{ maintenancePlanStatus.reminderLevel }}
                </div>
              </template>
              <template v-else>
                <span class="muted">未设置</span>
                <div class="stat-sub muted">可在装备编辑中设置</div>
              </template>
            </div>
            <div class="stat-label">下次保养计划</div>
          </div>
          <div class="stat-card">
            <div class="stat-num">{{ damageCount }}<span class="stat-unit muted">次</span></div>
            <div class="stat-label">历史损耗记录</div>
            <div v-if="inventoryDamageCount > 0" class="stat-sub muted">
              含盘点发现 {{ inventoryDamageCount }} 次
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-num">
              ¥{{ depositDeductTotal }}
              <div class="stat-sub muted">{{ depositDeductCount }} 次扣除</div>
            </div>
            <div class="stat-label">累计押金扣除</div>
            <div v-if="inventoryDepositDeductCount > 0" class="stat-sub muted">
              含盘点待扣 {{ inventoryDepositDeductCount }} 次
            </div>
          </div>
          <div v-if="inventoryAbnormalActions.length > 0" class="stat-card inventory-card">
            <div class="stat-num">{{ inventoryAbnormalActions.length }}<span class="stat-unit muted">条</span></div>
            <div class="stat-label">盘点异常记录</div>
            <div class="stat-sub muted">
              保养 {{ inventoryMaintenanceCount }} 次 · 待处理 
              {{ inventoryAbnormalActions.filter(a => a.status === '待处理').length }} 条
            </div>
          </div>
        </div>
      </section>

      <section class="actions-section">
        <h3 class="section-title">💡 建议处理动作</h3>
        <div class="action-list">
          <div
            v-for="action in suggestedActions"
            :key="action.key"
            :class="['action-card', action.priority]"
          >
            <div class="action-priority">
              <span v-if="action.priority === 'high'">🔴</span>
              <span v-else-if="action.priority === 'medium'">🟡</span>
              <span v-else>🟢</span>
            </div>
            <div class="action-body">
              <div class="action-title">{{ action.title }}</div>
              <p class="action-desc muted">{{ action.description }}</p>
              <button
                v-if="action.canCreateMaintenance"
                class="btn-create-maintenance"
                @click="$emit('create-maintenance', { gearId: gear.id, type: action.maintenanceType })"
              >
                🛠️ 创建保养记录
              </button>
            </div>
          </div>
        </div>
      </section>

      <section class="borrowers-section">
        <h3 class="section-title">
          <span>👥 历史借用人</span>
          <span class="title-hint muted">共 {{ borrowerHistory.length }} 人</span>
        </h3>
        <div v-if="borrowerHistory.length === 0" class="empty-hint muted">
          尚无借用记录
        </div>
        <div v-else class="borrower-list">
          <div v-for="(b, idx) in borrowerHistory" :key="b.name" class="borrower-item">
            <span class="borrower-rank">{{ idx + 1 }}</span>
            <div class="borrower-info">
              <span class="borrower-name">{{ b.name }}</span>
              <span class="borrower-count muted">借用 {{ b.count }} 次</span>
            </div>
            <span v-if="b.lastDate" class="borrower-last muted">
              最近：{{ b.lastDate }}
            </span>
          </div>
        </div>
      </section>

      <section class="timeline-section">
        <h3 class="section-title">
          <span>📜 事件时间线</span>
          <span class="title-hint muted">共 {{ timeline.length }} 条记录</span>
        </h3>
        <HealthTimeline :events="timeline" />
      </section>
    </template>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useEquipmentHealth } from '../composables/useEquipmentHealth.js';
import HealthTimeline from './HealthTimeline.vue';

const props = defineProps({
  gearId: {
    type: String,
    required: true
  },
  gears: {
    type: Object,
    required: true
  },
  requests: {
    type: Object,
    required: true
  },
  handovers: {
    type: Object,
    required: true
  },
  maintenanceRecords: {
    type: Object,
    required: true
  },
  depositRecords: {
    type: Object,
    required: true
  },
  inventoryLists: {
    type: Array,
    default: () => []
  }
});

defineEmits(['close', 'create-maintenance', 'view-timeline']);

const gearIdRef = computed(() => props.gearId);

const {
  gear,
  borrowCount,
  lastMaintenance,
  daysSinceLastMaintenance,
  maintenancePlanStatus,
  damageCount,
  depositDeductCount,
  depositDeductTotal,
  borrowerHistory,
  timeline,
  riskTags,
  suggestedActions,
  overallHealthScore,
  healthLevel,
  inventoryAbnormalActions,
  inventoryDamageCount,
  inventoryMaintenanceCount,
  inventoryDepositDeductCount
} = useEquipmentHealth({
  gearId: gearIdRef,
  gears: props.gears,
  requests: props.requests,
  handovers: props.handovers,
  maintenanceRecords: props.maintenanceRecords,
  depositRecords: props.depositRecords,
  inventoryLists: props.inventoryLists
});

function getCategoryIcon(category) {
  const map = {
    '帐篷天幕': '⛺',
    '炊具': '🍳',
    '照明': '🔦',
    '桌椅收纳': '🪑',
    '安全急救': '🩹'
  };
  return map[category] || '🎒';
}
</script>

<style scoped>
.equipment-health-profile {
  max-width: 960px;
  margin: 0 auto;
  padding: 20px;
  background: #faf9f5;
  border-radius: 16px;
}

.profile-header {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 12px;
  gap: 8px;
}

.close-btn {
  padding: 6px 14px;
  font-size: 13px;
}

.timeline-btn {
  padding: 6px 14px;
  font-size: 13px;
  background: #2f4a2c;
  color: #fff;
  border-color: #2f4a2c;
}

.timeline-btn:hover {
  background: #3d5c37;
  border-color: #3d5c37;
}

.profile-empty {
  padding: 60px 20px;
  text-align: center;
}

.profile-hero {
  display: flex;
  gap: 24px;
  align-items: center;
  justify-content: space-between;
  background: linear-gradient(135deg, #fffef8 0%, #f5f3e8 100%);
  border: 1px solid #e4e1d0;
  border-radius: 14px;
  padding: 24px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.hero-main {
  display: flex;
  gap: 18px;
  align-items: flex-start;
  flex: 1;
  min-width: 280px;
}

.gear-icon {
  width: 64px;
  height: 64px;
  border-radius: 14px;
  background: linear-gradient(135deg, #f0ebe0, #e4dfd0);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 32px;
  flex-shrink: 0;
  border: 2px solid #d4cdb8;
}

.hero-info {
  flex: 1;
  min-width: 0;
}

.gear-name {
  margin: 0 0 10px;
  font-size: 22px;
  color: #3a3730;
  font-weight: 700;
}

.gear-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
}

.meta-chip {
  font-size: 12px;
  padding: 3px 10px;
  border-radius: 12px;
  background: #ece8d8;
  color: #5a5548;
  font-weight: 500;
}

.meta-chip.owner {
  background: #e8f0e4;
  color: #3a5a2a;
}

.meta-chip.status.可借 {
  background: #e4f0e4;
  color: #2f6a2a;
}

.meta-chip.status.借出中 {
  background: #fdf2e5;
  color: #8a5a2a;
}

.gear-notes {
  margin: 0;
  font-size: 13px;
  color: #6b6455;
  line-height: 1.5;
}

.hero-score {
  flex-shrink: 0;
}

.score-ring {
  position: relative;
  width: 120px;
  height: 120px;
}

.score-svg {
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}

.score-bg {
  fill: none;
  stroke: #ece8d8;
  stroke-width: 10;
}

.score-fg {
  fill: none;
  stroke-width: 10;
  stroke-linecap: round;
  transition: stroke-dasharray 0.6s ease;
}

.score-text {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
}

.score-num {
  font-size: 32px;
  font-weight: 800;
  line-height: 1;
}

.score-label {
  font-size: 12px;
  margin-top: 4px;
  color: #6b6455;
  font-weight: 600;
}

.section-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 16px;
  margin: 0 0 14px;
  color: #3a3730;
  font-weight: 700;
}

.title-hint {
  font-size: 12px;
  font-weight: 400;
}

.risk-section,
.stats-section,
.actions-section,
.borrowers-section,
.timeline-section {
  background: #fff;
  border: 1px solid #e4e1d6;
  border-radius: 12px;
  padding: 18px 20px;
  margin-bottom: 16px;
}

.risk-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.risk-tag {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  padding: 6px 12px;
  border-radius: 10px;
  font-weight: 600;
  border: 1px solid transparent;
}

.risk-tag.danger {
  background: #fde8e4;
  color: #8a2a2a;
  border-color: #f5c8bf;
}

.risk-tag.warning {
  background: #fdf2e5;
  color: #8a5a2a;
  border-color: #f0d5b0;
}

.risk-tag.info {
  background: #eef4fb;
  color: #3a5e7a;
  border-color: #c5d8ee;
}

.tag-icon {
  font-size: 13px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
}

.stat-card {
  background: #faf9f4;
  border: 1px solid #ece8d8;
  border-radius: 10px;
  padding: 14px 16px;
}

.stat-num {
  font-size: 18px;
  font-weight: 700;
  color: #3a3730;
  line-height: 1.3;
  margin-bottom: 4px;
}

.stat-num.big {
  font-size: 28px;
}

.stat-unit {
  font-size: 13px;
  font-weight: 500;
  margin-left: 3px;
}

.stat-sub {
  font-size: 11px;
  margin-top: 3px;
  font-weight: 500;
}

.stat-label {
  font-size: 12px;
  color: #6b6455;
  margin-top: 4px;
}

.stat-card.plan-overdue {
  border-color: #f5c8bf;
  background: #fff6f4;
}

.stat-card.plan-upcoming {
  border-color: #f0d5b0;
  background: #fffaf2;
}

.stat-card.inventory-card {
  border-color: #f0d5b0;
  background: linear-gradient(135deg, #fffaf0, #fff5e0);
}

.stat-sub.danger {
  color: #b02a2a;
  font-weight: 600;
}

.stat-sub.warning {
  color: #8a5a2a;
  font-weight: 600;
}

.btn-create-maintenance {
  margin-top: 10px;
  padding: 6px 14px;
  font-size: 12px;
  background: #2f4a2c;
  color: #fff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
  transition: background 0.2s;
}

.btn-create-maintenance:hover {
  background: #3d5c37;
}

.action-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.action-card {
  display: flex;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 10px;
  border: 1px solid #ece8d8;
  background: #faf9f4;
}

.action-card.high {
  border-color: #f5c8bf;
  background: #fff6f4;
}

.action-card.medium {
  border-color: #f0d5b0;
  background: #fffaf2;
}

.action-priority {
  font-size: 18px;
  flex-shrink: 0;
  line-height: 1.2;
}

.action-body {
  flex: 1;
  min-width: 0;
}

.action-title {
  font-size: 14px;
  font-weight: 700;
  color: #3a3730;
  margin-bottom: 4px;
}

.action-desc {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
}

.empty-hint {
  text-align: center;
  padding: 16px;
  font-size: 13px;
}

.borrower-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.borrower-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 8px;
  background: #faf9f4;
  border: 1px solid #ece8d8;
}

.borrower-rank {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #ece8d8;
  color: #5a5548;
  font-size: 12px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.borrower-item:nth-child(1) .borrower-rank {
  background: linear-gradient(135deg, #ffd700, #ffb800);
  color: #5a3a00;
}

.borrower-item:nth-child(2) .borrower-rank {
  background: linear-gradient(135deg, #e0e0e0, #c0c0c0);
  color: #3a3730;
}

.borrower-item:nth-child(3) .borrower-rank {
  background: linear-gradient(135deg, #e8b880, #c89560);
  color: #5a3a20;
}

.borrower-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.borrower-name {
  font-size: 14px;
  font-weight: 600;
  color: #3a3730;
}

.borrower-count {
  font-size: 12px;
}

.borrower-last {
  font-size: 12px;
  flex-shrink: 0;
}

.muted {
  color: #8a8475;
}

@media (max-width: 640px) {
  .equipment-health-profile {
    padding: 14px;
  }
  .profile-hero {
    padding: 18px;
    flex-direction: column;
    align-items: flex-start;
  }
  .hero-score {
    align-self: center;
  }
  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>

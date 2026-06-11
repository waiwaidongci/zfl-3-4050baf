<template>
  <div class="health-timeline">
    <div v-if="events.length === 0" class="timeline-empty">
      <span class="timeline-empty-icon">📋</span>
      <p class="muted">暂无历史事件记录</p>
    </div>
    <div v-else class="timeline-list">
      <div
        v-for="(event, idx) in events"
        :key="event.id"
        :class="['timeline-item', event.type, { first: idx === 0 }]"
      >
        <div class="timeline-dot">
          <span class="dot-icon">{{ getIcon(event.type) }}</span>
        </div>
        <div class="timeline-line" v-if="idx < events.length - 1"></div>
        <div class="timeline-content">
          <div class="timeline-header">
            <span class="timeline-date">{{ event.date }}</span>
            <span :class="['timeline-type-tag', event.type]">{{ getTypeLabel(event.type) }}</span>
          </div>
          <div class="timeline-title">
            <strong>{{ event.title }}</strong>
            <span v-if="event.subType" :class="['sub-tag', event.subType]">{{ event.subType }}</span>
          </div>
          <p v-if="event.description" class="timeline-desc">{{ event.description }}</p>
          <div v-if="hasMeta(event)" class="timeline-meta">
            <span v-if="event.meta.handler" class="meta-item">👤 处理人：{{ event.meta.handler }}</span>
            <span v-if="event.meta.borrower" class="meta-item">👥 借用人：{{ event.meta.borrower }}</span>
            <span v-if="event.meta.owner" class="meta-item">🔑 出借人：{{ event.meta.owner }}</span>
            <span v-if="event.meta.start && event.meta.end" class="meta-item">📅 借用期：{{ event.meta.start }} ~ {{ event.meta.end }}</span>
            <span v-if="event.meta.completed !== undefined" class="meta-item">
              {{ event.meta.completed ? '✅ 双方已确认' : '⏳ 待确认' }}
            </span>
            <span v-if="event.meta.damageRecord" class="meta-item damage">
              ⚠️ 损耗：{{ event.meta.damageRecord }}
            </span>
            <span v-if="event.meta.deductAmount" class="meta-item deduct">
              💰 扣除押金：¥{{ event.meta.deductAmount }}
              <span v-if="event.meta.deductReason">（{{ event.meta.deductReason }}）</span>
            </span>
            <span v-if="event.meta.amount" class="meta-item deduct">
              💰 扣除金额：¥{{ event.meta.amount }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  events: {
    type: Array,
    required: true
  }
});

function getIcon(type) {
  const map = {
    'maintenance': '🧽',
    'borrow': '📝',
    'handover-out': '📤',
    'handover-in': '📥',
    'deposit-deduct': '💸'
  };
  return map[type] || '📌';
}

function getTypeLabel(type) {
  const map = {
    'maintenance': '保养',
    'borrow': '申请',
    'handover-out': '借出',
    'handover-in': '归还',
    'deposit-deduct': '扣押金'
  };
  return map[type] || '事件';
}

function hasMeta(event) {
  if (!event.meta) return false;
  return Object.values(event.meta).some((v) => v !== undefined && v !== null && v !== '');
}
</script>

<style scoped>
.health-timeline {
  padding: 12px 0;
}

.timeline-empty {
  text-align: center;
  padding: 40px 20px;
}

.timeline-empty-icon {
  font-size: 48px;
  display: block;
  margin-bottom: 12px;
  opacity: 0.5;
}

.timeline-list {
  position: relative;
}

.timeline-item {
  position: relative;
  padding-left: 52px;
  padding-bottom: 28px;
}

.timeline-item.first .timeline-content {
  background: linear-gradient(135deg, #f0f7ee 0%, #fff 100%);
  border-color: #c8ddbf;
}

.timeline-dot {
  position: absolute;
  left: 0;
  top: 4px;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: #f5f5f0;
  border: 2px solid #d4d0c4;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2;
  font-size: 16px;
}

.timeline-item.maintenance .timeline-dot {
  background: #eaf3e4;
  border-color: #8cbf7a;
}

.timeline-item.borrow .timeline-dot {
  background: #eef4fb;
  border-color: #7aa6d9;
}

.timeline-item.handover-out .timeline-dot {
  background: #fdf2e5;
  border-color: #e0a96d;
}

.timeline-item.handover-in .timeline-dot {
  background: #e8f4ef;
  border-color: #6dbf9c;
}

.timeline-item.deposit-deduct .timeline-dot {
  background: #fbe9e7;
  border-color: #d97a7a;
}

.timeline-line {
  position: absolute;
  left: 17px;
  top: 40px;
  bottom: 0;
  width: 2px;
  background: linear-gradient(to bottom, #d4d0c4, #eae8df);
}

.timeline-content {
  background: #fff;
  border: 1px solid #e4e1d6;
  border-radius: 10px;
  padding: 14px 16px;
}

.timeline-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  gap: 12px;
}

.timeline-date {
  font-size: 13px;
  color: #8a8475;
  font-weight: 500;
}

.timeline-type-tag {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
  font-weight: 600;
}

.timeline-type-tag.maintenance {
  background: #eaf3e4;
  color: #4a7a3a;
}

.timeline-type-tag.borrow {
  background: #eef4fb;
  color: #3a5e7a;
}

.timeline-type-tag.handover-out {
  background: #fdf2e5;
  color: #8a5a2a;
}

.timeline-type-tag.handover-in {
  background: #e8f4ef;
  color: #2a6a52;
}

.timeline-type-tag.deposit-deduct {
  background: #fbe9e7;
  color: #8a2a2a;
}

.timeline-title {
  margin-bottom: 6px;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.timeline-title strong {
  font-size: 14px;
  color: #3a3730;
}

.sub-tag {
  font-size: 11px;
  padding: 1px 7px;
  border-radius: 8px;
  background: #f5f5f0;
  color: #6b6455;
}

.sub-tag.已同意, .sub-tag.已归还, .sub-tag.completed {
  background: #eaf3e4;
  color: #4a7a3a;
}

.sub-tag.待处理, .sub-tag.pending {
  background: #fdf2e5;
  color: #8a5a2a;
}

.sub-tag.已拒绝 {
  background: #fbe9e7;
  color: #8a2a2a;
}

.sub-tag.草稿, .sub-tag.借出中 {
  background: #eef4fb;
  color: #3a5e7a;
}

.timeline-desc {
  font-size: 13px;
  color: #5a5548;
  margin: 6px 0 10px;
  line-height: 1.55;
}

.timeline-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 14px;
  padding-top: 10px;
  border-top: 1px dashed #ece9de;
}

.meta-item {
  font-size: 12px;
  color: #6b6455;
}

.meta-item.damage {
  color: #8a2a2a;
  background: #fbe9e7;
  padding: 2px 8px;
  border-radius: 6px;
}

.meta-item.deduct {
  color: #8a5a2a;
  background: #fdf2e5;
  padding: 2px 8px;
  border-radius: 6px;
}

.muted {
  color: #8a8475;
}
</style>

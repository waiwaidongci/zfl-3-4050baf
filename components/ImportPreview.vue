<template>
  <div class="import-preview">
    <div class="preview-header">
      <h3>数据预览</h3>
      <span v-if="previewResult.summary.hasLegacyFormat" class="legacy-badge">旧版格式已兼容</span>
    </div>

    <div v-if="previewResult.errors.length > 0" class="error-section">
      <h4 class="error-title">❌ 导入错误</h4>
      <ul class="error-list">
        <li v-for="(err, idx) in previewResult.errors" :key="idx" class="error-item">{{ err }}</li>
      </ul>
    </div>

    <div v-if="previewResult.valid" class="mode-section">
      <h4>📋 导入模式</h4>
      <div class="mode-options">
        <label class="mode-option" :class="{ active: importMode === 'overwrite' }">
          <input type="radio" v-model="importMode" value="overwrite" />
          <div class="mode-content">
            <span class="mode-title">覆盖模式</span>
            <span class="mode-desc">用导入数据替换当前空间中对应的数据，未包含的数据保留不变</span>
          </div>
        </label>
        <label class="mode-option" :class="{ active: importMode === 'merge' }">
          <input type="radio" v-model="importMode" value="merge" />
          <div class="mode-content">
            <span class="mode-title">合并模式</span>
            <span class="mode-desc">智能合并数据，按规则去重更新，避免重复记录</span>
          </div>
        </label>
      </div>
    </div>

    <div v-if="importMode === 'merge' && previewResult.mergeAnalysis" class="merge-summary-section">
      <h4>🔄 合并预览统计</h4>
      <div class="merge-summary-grid">
        <div class="merge-stat-card added">
          <span class="merge-stat-count">{{ previewResult.mergeAnalysis.summary.totalAdded }}</span>
          <span class="merge-stat-label">新增</span>
        </div>
        <div class="merge-stat-card updated">
          <span class="merge-stat-count">{{ previewResult.mergeAnalysis.summary.totalUpdated }}</span>
          <span class="merge-stat-label">更新</span>
        </div>
        <div class="merge-stat-card skipped">
          <span class="merge-stat-count">{{ previewResult.mergeAnalysis.summary.totalSkipped }}</span>
          <span class="merge-stat-label">跳过</span>
        </div>
        <div class="merge-stat-card unmatched">
          <span class="merge-stat-count">{{ previewResult.mergeAnalysis.summary.totalUnmatched }}</span>
          <span class="merge-stat-label">无法匹配</span>
        </div>
      </div>

      <div class="merge-details">
        <div v-for="entity in entities" :key="entity.key" class="merge-entity-row" v-if="isEntityIncluded(entity.key)">
          <span class="merge-entity-label">{{ entity.label }}</span>
          <div class="merge-entity-stats">
            <span class="stat-badge added">+{{ getMergeStat(entity.key, 'added') }}</span>
            <span class="stat-badge updated">~{{ getMergeStat(entity.key, 'updated') }}</span>
            <span class="stat-badge skipped">={{ getMergeStat(entity.key, 'skipped') }}</span>
            <span class="stat-badge unmatched">?{{ getMergeStat(entity.key, 'unmatched') }}</span>
          </div>
        </div>
      </div>

      <p v-if="previewResult.mergeAnalysis.summary.totalUnmatched > 0" class="unmatched-hint">
        ⚠️ 有 {{ previewResult.mergeAnalysis.summary.totalUnmatched }} 条记录无法匹配到有效关联（如缺失装备或成员信息），将不会被导入
      </p>
    </div>

    <div class="summary-section">
      <h4>📊 数据摘要</h4>
      <div class="summary-grid">
        <div v-for="entity in entities" :key="entity.key" class="summary-card" :class="{ 'not-included': !isEntityIncluded(entity.key) }">
          <span class="summary-count">{{ getEntityDisplay(entity.key) }}</span>
          <span class="summary-label">{{ entity.label }}</span>
        </div>
      </div>
      <p v-if="hasExcludedEntities" class="excluded-hint">
        ℹ️ 灰色项表示该类数据未包含在导入文件中，{{ importMode === 'overwrite' ? '不会被覆盖' : '保持不变' }}
      </p>
    </div>

    <div v-if="previewResult.warnings.length > 0" class="warning-section">
      <div class="warning-header" @click="showWarnings = !showWarnings">
        <h4>⚠️ 异常项 ({{ previewResult.warnings.length }})</h4>
        <span class="toggle-icon">{{ showWarnings ? '收起' : '展开' }}</span>
      </div>
      <div v-if="showWarnings" class="warning-list">
        <div v-for="(warn, idx) in displayedWarnings" :key="idx" class="warning-item">{{ warn }}</div>
        <div v-if="previewResult.warnings.length > 5 && !showAllWarnings" class="show-more" @click="showAllWarnings = true">
          还有 {{ previewResult.warnings.length - 5 }} 条，点击展开全部
        </div>
        <div v-if="showAllWarnings && previewResult.warnings.length > 5" class="show-more" @click="showAllWarnings = false">
          收起
        </div>
      </div>
    </div>

    <div class="preview-actions">
      <button class="btn-cancel" @click="$emit('cancel')">取消</button>
      <button
        class="btn-confirm"
        :disabled="!previewResult.valid"
        @click="handleConfirm"
      >
        确认{{ importMode === 'overwrite' ? '覆盖' : '合并' }}导入
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { DATA_ENTITIES, ENTITY_LABELS } from '../utils/dataTransform.js';

const props = defineProps({
  previewResult: {
    type: Object,
    required: true
  },
  defaultMode: {
    type: String,
    default: 'overwrite'
  }
});

const emit = defineEmits(['cancel', 'confirm']);

const showWarnings = ref(true);
const showAllWarnings = ref(false);
const importMode = ref(props.defaultMode);

watch(() => props.defaultMode, (val) => {
  importMode.value = val;
});

const entities = computed(() => {
  return DATA_ENTITIES.map((key) => ({
    key,
    label: ENTITY_LABELS[key]
  }));
});

function isEntityIncluded(entityKey) {
  return props.previewResult.summary?.[entityKey] !== undefined;
}

function getEntityDisplay(entityKey) {
  const count = props.previewResult.summary?.[entityKey];
  return count !== undefined ? count : '—';
}

function getMergeStat(entityKey, statType) {
  const analysis = props.previewResult.mergeAnalysis?.analysis?.[entityKey];
  if (!analysis) return 0;
  return analysis[statType] || 0;
}

const hasExcludedEntities = computed(() => {
  return DATA_ENTITIES.some((key) => !isEntityIncluded(key));
});

const displayedWarnings = computed(() => {
  if (showAllWarnings.value) {
    return props.previewResult.warnings;
  }
  return props.previewResult.warnings.slice(0, 5);
});

function handleConfirm() {
  emit('confirm', {
    data: props.previewResult.data,
    mode: importMode.value,
    mergeAnalysis: importMode.value === 'merge' ? props.previewResult.mergeAnalysis : null
  });
}
</script>

<style scoped>
.import-preview {
  background: #fff;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
}

.preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid #eee;
}

.preview-header h3 {
  margin: 0;
  color: #2f4a2c;
  font-size: 18px;
}

.legacy-badge {
  background: #fff3cd;
  color: #856404;
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 12px;
}

.error-section {
  background: #fee;
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 16px;
}

.error-title {
  margin: 0 0 8px 0;
  color: #c53030;
  font-size: 14px;
}

.error-list {
  margin: 0;
  padding-left: 20px;
}

.error-item {
  color: #9b2c2c;
  font-size: 13px;
  margin-bottom: 4px;
}

.summary-section h4 {
  margin: 0 0 12px 0;
  color: #333;
  font-size: 14px;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
  gap: 10px;
  margin-bottom: 16px;
}

.summary-card {
  background: #f7f9f5;
  border-radius: 8px;
  padding: 12px 8px;
  text-align: center;
}

.summary-card.not-included {
  background: #f5f5f5;
  opacity: 0.6;
}

.summary-card.not-included .summary-count {
  color: #999;
}

.summary-card.not-included .summary-label {
  color: #aaa;
}

.excluded-hint {
  margin: 8px 0 0 0;
  font-size: 12px;
  color: #888;
  text-align: center;
}

.summary-count {
  display: block;
  font-size: 24px;
  font-weight: 700;
  color: #2f4a2c;
}

.summary-label {
  display: block;
  font-size: 12px;
  color: #63705d;
  margin-top: 4px;
}

.warning-section {
  margin-bottom: 16px;
  border: 1px solid #ffeaa7;
  border-radius: 8px;
  overflow: hidden;
}

.warning-header {
  background: #fffbeb;
  padding: 10px 14px;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.warning-header h4 {
  margin: 0;
  font-size: 14px;
  color: #92400e;
}

.toggle-icon {
  font-size: 12px;
  color: #b45309;
}

.warning-list {
  padding: 10px 14px;
  max-height: 200px;
  overflow-y: auto;
}

.warning-item {
  font-size: 13px;
  color: #78350f;
  padding: 4px 0;
  border-bottom: 1px dashed #fde68a;
}

.warning-item:last-child {
  border-bottom: none;
}

.show-more {
  text-align: center;
  color: #b45309;
  font-size: 12px;
  padding: 8px;
  cursor: pointer;
  background: #fef3c7;
  margin: 8px -14px -10px;
}

.preview-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding-top: 12px;
  border-top: 1px solid #eee;
}

.btn-cancel {
  padding: 8px 20px;
  border: 1px solid #ccc;
  background: #fff;
  border-radius: 6px;
  cursor: pointer;
  color: #666;
  font-size: 14px;
}

.btn-cancel:hover {
  background: #f5f5f5;
}

.btn-confirm {
  padding: 8px 20px;
  background: #2f4a2c;
  color: #fff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
}

.btn-confirm:hover:not(:disabled) {
  background: #3d5c37;
}

.btn-confirm:disabled {
  background: #999;
  cursor: not-allowed;
}

.mode-section {
  margin-bottom: 16px;
}

.mode-section h4 {
  margin: 0 0 12px 0;
  color: #333;
  font-size: 14px;
}

.mode-options {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.mode-option {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 12px;
  border: 2px solid #e5e7eb;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  background: #fafafa;
}

.mode-option:hover {
  border-color: #c5d0b9;
  background: #f7f9f5;
}

.mode-option.active {
  border-color: #2f4a2c;
  background: #f0f4ed;
}

.mode-option input[type="radio"] {
  margin-top: 3px;
  cursor: pointer;
}

.mode-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.mode-title {
  font-weight: 600;
  color: #2f4a2c;
  font-size: 14px;
}

.mode-desc {
  font-size: 12px;
  color: #6b7280;
  line-height: 1.4;
}

.merge-summary-section {
  background: #f0f9eb;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
  border: 1px solid #c5e0b4;
}

.merge-summary-section h4 {
  margin: 0 0 12px 0;
  color: #2f4a2c;
  font-size: 14px;
}

.merge-summary-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
  margin-bottom: 16px;
}

.merge-stat-card {
  background: #fff;
  border-radius: 8px;
  padding: 12px 8px;
  text-align: center;
  border: 2px solid transparent;
}

.merge-stat-card.added {
  border-color: #a7f3d0;
}

.merge-stat-card.updated {
  border-color: #bfdbfe;
}

.merge-stat-card.skipped {
  border-color: #e5e7eb;
}

.merge-stat-card.unmatched {
  border-color: #fecaca;
}

.merge-stat-count {
  display: block;
  font-size: 24px;
  font-weight: 700;
  color: #2f4a2c;
}

.merge-stat-card.added .merge-stat-count {
  color: #059669;
}

.merge-stat-card.updated .merge-stat-count {
  color: #2563eb;
}

.merge-stat-card.skipped .merge-stat-count {
  color: #6b7280;
}

.merge-stat-card.unmatched .merge-stat-count {
  color: #dc2626;
}

.merge-stat-label {
  display: block;
  font-size: 12px;
  color: #63705d;
  margin-top: 4px;
}

.merge-details {
  background: #fff;
  border-radius: 8px;
  padding: 12px;
}

.merge-entity-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid #f0f0f0;
}

.merge-entity-row:last-child {
  border-bottom: none;
}

.merge-entity-label {
  font-size: 13px;
  color: #333;
  font-weight: 500;
}

.merge-entity-stats {
  display: flex;
  gap: 6px;
}

.stat-badge {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
}

.stat-badge.added {
  background: #d1fae5;
  color: #065f46;
}

.stat-badge.updated {
  background: #dbeafe;
  color: #1e40af;
}

.stat-badge.skipped {
  background: #f3f4f6;
  color: #4b5563;
}

.stat-badge.unmatched {
  background: #fee2e2;
  color: #991b1b;
}

.unmatched-hint {
  margin: 12px 0 0 0;
  padding: 10px 12px;
  background: #fef2f2;
  border-radius: 6px;
  font-size: 12px;
  color: #dc2626;
  line-height: 1.5;
}

@media (max-width: 600px) {
  .mode-options {
    grid-template-columns: 1fr;
  }

  .merge-summary-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>

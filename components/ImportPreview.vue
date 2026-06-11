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

    <div class="summary-section">
      <h4>📊 数据摘要</h4>
      <div class="summary-grid">
        <div v-for="entity in entities" :key="entity.key" class="summary-card">
          <span class="summary-count">{{ previewResult.summary[entity.key] }}</span>
          <span class="summary-label">{{ entity.label }}</span>
        </div>
      </div>
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
        @click="$emit('confirm', previewResult.data)"
      >
        确认导入
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { DATA_ENTITIES, ENTITY_LABELS } from '../utils/dataTransform.js';

const props = defineProps({
  previewResult: {
    type: Object,
    required: true
  }
});

defineEmits(['cancel', 'confirm']);

const showWarnings = ref(true);
const showAllWarnings = ref(false);

const entities = computed(() => {
  return DATA_ENTITIES.map((key) => ({
    key,
    label: ENTITY_LABELS[key]
  }));
});

const displayedWarnings = computed(() => {
  if (showAllWarnings.value) {
    return props.previewResult.warnings;
  }
  return props.previewResult.warnings.slice(0, 5);
});
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
</style>

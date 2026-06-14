<template>
  <div class="inventory-panel">
    <section v-if="!selectedId" class="layout">
      <form class="panel" @submit.prevent="handleCreate">
        <h2>新建盘点单</h2>
        <label class="muted">盘点单名称</label>
        <input v-model="createForm.name" placeholder="例如：五一出行前盘点" />
        <label class="muted">盘点类型</label>
        <select v-model="createForm.type">
          <option value="出行前">出行前</option>
          <option value="出行后">出行后</option>
        </select>
        <label class="muted">关联出行（可选）</label>
        <select v-model="createForm.tripId">
          <option value="">不关联出行</option>
          <option v-for="trip in trips" :key="trip.id" :value="trip.id">
            {{ trip.destination }} · {{ trip.startDate }}
          </option>
        </select>
        <small class="muted">关联出行后将自动带入该出行清单的装备</small>
        <label class="muted">盘点人</label>
        <select v-model="createForm.checker">
          <option v-for="member in members" :key="member.id" :value="member.nickname">
            {{ member.nickname }}
          </option>
        </select>
        <label class="muted">备注</label>
        <textarea v-model="createForm.notes" placeholder="盘点说明或注意事项" rows="3"></textarea>
        <button type="submit">创建盘点单</button>
      </form>

      <div class="panel wide">
        <InventoryList :lists="inventoryLists" @select="selectInventory" />
      </div>
    </section>

    <section v-else class="panel">
      <InventoryDetail
        v-if="currentInventory"
        :inventory="currentInventory"
        :gears="gears"
        :trips="trips"
        :members="members"
        @back="goBack"
        @toggle-item="handleToggleItem"
        @update-item="handleUpdateItem"
        @remove-item="handleRemoveItem"
        @add-gear="handleAddGear"
        @add-gears-from-trip="handleAddGearsFromTrip"
        @complete="handleComplete"
        @reopen="handleReopen"
        @update-notes="handleUpdateNotes"
        @add-action="handleAddAction"
        @update-action="handleUpdateAction"
        @remove-action="handleRemoveAction"
      />
      <div v-else class="empty-state">
        <p>盘点单不存在</p>
        <button class="ghost" @click="goBack">返回列表</button>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, computed, watch, toRef } from 'vue';
import InventoryList from './InventoryList.vue';
import InventoryDetail from './InventoryDetail.vue';
import { useInventory } from '../composables/useInventory.js';

const props = defineProps({
  inventoryLists: {
    type: Array,
    default: () => []
  },
  gears: {
    type: Array,
    default: () => []
  },
  trips: {
    type: Array,
    default: () => []
  },
  members: {
    type: Array,
    default: () => []
  },
  currentUser: {
    type: String,
    default: ''
  },
  openInventoryId: {
    type: String,
    default: null
  }
});

const emit = defineEmits(['update:inventoryLists', 'process-abnormal-action', 'log-event']);

const selectedId = ref(null);

const createForm = ref({
  name: '',
  type: '出行前',
  tripId: '',
  checker: '',
  notes: ''
});

const inventory = useInventory({
  inventoryLists: toRef(props, 'inventoryLists'),
  gears: toRef(props, 'gears'),
  trips: toRef(props, 'trips'),
  members: toRef(props, 'members'),
  currentUser: toRef(props, 'currentUser')
});

const currentInventory = computed(() =>
  inventory.getListById(selectedId.value)
);

watch(
  () => props.currentUser,
  (val) => {
    if (val && !createForm.value.checker) {
      createForm.value.checker = val;
    }
  },
  { immediate: true }
);

watch(
  () => props.members,
  (val) => {
    if (val && val.length > 0 && !createForm.value.checker) {
      const firstMember = val.find((m) => m.nickname === props.currentUser);
      createForm.value.checker = firstMember ? firstMember.nickname : val[0].nickname;
    }
  },
  { immediate: true }
);

watch(
  () => props.openInventoryId,
  (id) => {
    if (id && props.inventoryLists.some((list) => list.id === id)) {
      selectedId.value = id;
    }
  },
  { immediate: true }
);

function selectInventory(id) {
  selectedId.value = id;
}

function goBack() {
  selectedId.value = null;
}

function updateLists(newLists) {
  emit('update:inventoryLists', newLists);
}

function handleCreate() {
  if (!createForm.value.name.trim()) {
    alert('请输入盘点单名称');
    return;
  }
  const beforeState = null;
  const newList = inventory.createList({
    name: createForm.value.name.trim(),
    type: createForm.value.type,
    tripId: createForm.value.tripId,
    checker: createForm.value.checker,
    notes: createForm.value.notes
  });
  if (newList) {
    updateLists([newList, ...props.inventoryLists]);
    selectedId.value = newList.id;
    emit('log-event', {
      entityType: 'inventory',
      entityId: newList.id,
      entityName: newList.name,
      action: 'create',
      beforeState,
      afterState: newList,
      sourcePage: '装备盘点',
      relatedEntityType: 'trip',
      relatedEntityId: newList.tripId || '',
      relatedEntityName: props.trips.find((t) => t.id === newList.tripId)?.destination || ''
    });
    createForm.value = {
      name: '',
      type: '出行前',
      tripId: '',
      checker: props.currentUser || '',
      notes: ''
    };
  }
}

function handleToggleItem(itemId) {
  const list = currentInventory.value;
  const item = list?.items.find((i) => i.id === itemId);
  const beforeState = item ? { ...item } : null;
  const updated = inventory.toggleItemStatus(selectedId.value, itemId);
  if (updated) {
    const updatedItem = updated.items.find((i) => i.id === itemId);
    updateLists(props.inventoryLists.map((l) => (l.id === selectedId.value ? updated : l)));
    emit('log-event', {
      entityType: 'inventory',
      entityId: selectedId.value,
      entityName: list?.name || '盘点单',
      action: 'update',
      beforeState: { item: beforeState },
      afterState: { item: updatedItem },
      sourcePage: '装备盘点',
      notes: `切换盘点项状态：${item?.gearName || ''}`,
      customChanges: { item: beforeState ? [{ field: 'status', before: beforeState.status, after: updatedItem?.status }] : [] }
    });
  }
}

function handleUpdateItem(itemId, updates) {
  const list = currentInventory.value;
  const item = list?.items.find((i) => i.id === itemId);
  const beforeState = item ? { ...item } : null;
  const updated = inventory.updateItem(selectedId.value, itemId, updates);
  if (updated) {
    const updatedItem = updated.items.find((i) => i.id === itemId);
    updateLists(props.inventoryLists.map((l) => (l.id === selectedId.value ? updated : l)));
    emit('log-event', {
      entityType: 'inventory',
      entityId: selectedId.value,
      entityName: list?.name || '盘点单',
      action: 'update',
      beforeState: { item: beforeState },
      afterState: { item: updatedItem },
      sourcePage: '装备盘点',
      notes: `更新盘点项：${item?.gearName || ''}`
    });
  }
}

function handleRemoveItem(itemId) {
  const list = currentInventory.value;
  const item = list?.items.find((i) => i.id === itemId);
  const beforeState = list ? { items: [...list.items] } : null;
  const updated = inventory.removeItemFromList(selectedId.value, itemId);
  if (updated) {
    updateLists(props.inventoryLists.map((l) => (l.id === selectedId.value ? updated : l)));
    emit('log-event', {
      entityType: 'inventory',
      entityId: selectedId.value,
      entityName: list?.name || '盘点单',
      action: 'update',
      beforeState,
      afterState: { items: updated.items },
      sourcePage: '装备盘点',
      notes: `移除盘点项：${item?.gearName || ''}`
    });
  }
}

function handleAddGear(gearId) {
  const list = currentInventory.value;
  const beforeState = list ? { items: [...list.items] } : null;
  const gear = props.gears.find((g) => g.id === gearId);
  const updated = inventory.addGearToList(selectedId.value, gearId);
  if (updated) {
    updateLists(props.inventoryLists.map((l) => (l.id === selectedId.value ? updated : l)));
    emit('log-event', {
      entityType: 'inventory',
      entityId: selectedId.value,
      entityName: list?.name || '盘点单',
      action: 'update',
      beforeState,
      afterState: { items: updated.items },
      sourcePage: '装备盘点',
      notes: `添加装备到盘点：${gear?.name || ''}`,
      relatedEntityType: 'gear',
      relatedEntityId: gearId,
      relatedEntityName: gear?.name || ''
    });
  } else {
    alert('该装备已在盘点单中');
  }
}

function handleAddGearsFromTrip(tripId) {
  const list = currentInventory.value;
  const beforeState = list ? { items: [...list.items] } : null;
  const trip = props.trips.find((t) => t.id === tripId);
  const updated = inventory.addGearsFromTrip(selectedId.value, tripId);
  if (updated) {
    const addedCount = updated.items.length - (currentInventory.value?.items?.length || 0);
    updateLists(props.inventoryLists.map((l) => (l.id === selectedId.value ? updated : l)));
    emit('log-event', {
      entityType: 'inventory',
      entityId: selectedId.value,
      entityName: list?.name || '盘点单',
      action: 'update',
      beforeState,
      afterState: { items: updated.items },
      sourcePage: '装备盘点',
      notes: `从出行清单添加装备：${trip?.destination || ''}，新增 ${addedCount} 件`,
      relatedEntityType: 'trip',
      relatedEntityId: tripId,
      relatedEntityName: trip?.destination || ''
    });
    if (addedCount > 0) {
      alert(`已从出行清单添加 ${addedCount} 件装备`);
    } else {
      alert('没有新装备可添加（已全部存在）');
    }
  }
}

function handleComplete() {
  const list = currentInventory.value;
  const beforeState = list ? { ...list } : null;
  const updated = inventory.completeList(selectedId.value);
  if (updated) {
    updateLists(props.inventoryLists.map((l) => (l.id === selectedId.value ? updated : l)));
    emit('log-event', {
      entityType: 'inventory',
      entityId: selectedId.value,
      entityName: list?.name || '盘点单',
      action: 'complete',
      beforeState,
      afterState: updated,
      sourcePage: '装备盘点'
    });
  }
}

function handleReopen() {
  const list = currentInventory.value;
  const beforeState = list ? { ...list } : null;
  const updated = inventory.reopenList(selectedId.value);
  if (updated) {
    updateLists(props.inventoryLists.map((l) => (l.id === selectedId.value ? updated : l)));
    emit('log-event', {
      entityType: 'inventory',
      entityId: selectedId.value,
      entityName: list?.name || '盘点单',
      action: 'update',
      beforeState,
      afterState: updated,
      sourcePage: '装备盘点',
      notes: '重新打开盘点单'
    });
  }
}

function handleUpdateNotes(notes) {
  const list = currentInventory.value;
  const beforeState = list ? { notes: list.notes } : null;
  const updated = inventory.updateListInfo(selectedId.value, { notes });
  if (updated) {
    updateLists(props.inventoryLists.map((l) => (l.id === selectedId.value ? updated : l)));
    emit('log-event', {
      entityType: 'inventory',
      entityId: selectedId.value,
      entityName: list?.name || '盘点单',
      action: 'update',
      beforeState,
      afterState: { notes: updated.notes },
      sourcePage: '装备盘点',
      notes: '更新盘点单备注'
    });
  }
}

function handleAddAction(itemId, actionData) {
  const list = currentInventory.value;
  const item = list?.items.find((i) => i.id === itemId);
  const beforeState = item ? { abnormalActions: [...(item.abnormalActions || [])] } : null;
  const updated = inventory.addAbnormalAction(selectedId.value, itemId, actionData);
  if (updated) {
    const updatedItem = updated.items.find((i) => i.id === itemId);
    updateLists(props.inventoryLists.map((l) => (l.id === selectedId.value ? updated : l)));
    emit('log-event', {
      entityType: 'inventory',
      entityId: selectedId.value,
      entityName: list?.name || '盘点单',
      action: 'update',
      beforeState: { abnormalActions: beforeState?.abnormalActions || [] },
      afterState: { abnormalActions: updatedItem?.abnormalActions || [] },
      sourcePage: '装备盘点',
      notes: `添加异常处理：${item?.gearName || ''} - ${actionData.type || ''}`,
      relatedEntityType: 'gear',
      relatedEntityId: item?.gearId || '',
      relatedEntityName: item?.gearName || ''
    });
  }
}

function handleUpdateAction(itemId, actionId, updates) {
  const list = inventory.getListById(selectedId.value);
  if (!list) return;
  const item = list.items.find((i) => i.id === itemId);
  const action = item?.abnormalActions?.find((a) => a.id === actionId);
  if (!action) return;

  const prevStatus = action.status;
  const newStatus = updates.status;
  const beforeState = { ...action };

  const updated = inventory.updateAbnormalAction(selectedId.value, itemId, actionId, updates);
  if (updated) {
    updateLists(props.inventoryLists.map((l) => (l.id === selectedId.value ? updated : l)));
    const updatedItem = updated.items.find((i) => i.id === itemId);
    const updatedAction = updatedItem?.abnormalActions?.find((a) => a.id === actionId);

    emit('log-event', {
      entityType: 'inventory',
      entityId: selectedId.value,
      entityName: list.name || '盘点单',
      action: 'update',
      beforeState,
      afterState: updatedAction,
      sourcePage: '装备盘点',
      notes: `更新异常处理：${item?.gearName || ''}`,
      relatedEntityType: 'gear',
      relatedEntityId: item?.gearId || '',
      relatedEntityName: item?.gearName || ''
    });

    if (prevStatus !== '已处理' && newStatus === '已处理') {
      emit('process-abnormal-action', {
        action: updatedAction,
        item: { id: updatedItem.id, gearId: updatedItem.gearId, gearName: updatedItem.gearName, owner: updatedItem.owner },
        inventoryId: selectedId.value,
        inventoryName: list.name
      });
    }
  }
}

function handleRemoveAction(itemId, actionId) {
  const list = currentInventory.value;
  const item = list?.items.find((i) => i.id === itemId);
  const action = item?.abnormalActions?.find((a) => a.id === actionId);
  const beforeState = action ? { ...action } : null;
  const updated = inventory.removeAbnormalAction(selectedId.value, itemId, actionId);
  if (updated) {
    updateLists(props.inventoryLists.map((l) => (l.id === selectedId.value ? updated : l)));
    emit('log-event', {
      entityType: 'inventory',
      entityId: selectedId.value,
      entityName: list?.name || '盘点单',
      action: 'update',
      beforeState,
      afterState: null,
      sourcePage: '装备盘点',
      notes: `移除异常处理：${item?.gearName || ''} - ${action?.type || ''}`,
      relatedEntityType: 'gear',
      relatedEntityId: item?.gearId || '',
      relatedEntityName: item?.gearName || ''
    });
  }
}
</script>

<style scoped>
.inventory-panel {
  width: 100%;
}

.layout {
  display: flex;
  gap: 20px;
  flex-wrap: wrap;
}

.panel {
  background: #fff;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  flex: 1;
  min-width: 300px;
}

.panel.wide {
  flex: 2;
  min-width: 400px;
}

.panel h2 {
  margin: 0 0 12px 0;
  color: #2f4a2c;
  font-size: 18px;
}

.panel label {
  display: block;
  font-size: 13px;
  color: #555;
  margin-bottom: 4px;
}

.panel input,
.panel select,
.panel textarea {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #d0d8c5;
  border-radius: 6px;
  font-size: 14px;
  margin-bottom: 12px;
  box-sizing: border-box;
  font-family: inherit;
}

.panel textarea {
  resize: vertical;
}

.panel button[type='submit'] {
  width: 100%;
  padding: 10px 16px;
  background: #2f4a2c;
  color: #fff;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: background 0.2s;
}

.panel button[type='submit']:hover {
  background: #3d5c37;
}

.muted {
  color: #888;
  font-size: 12px;
}

.empty-state {
  padding: 40px 20px;
  text-align: center;
  color: #999;
}

@media (max-width: 768px) {
  .layout {
    flex-direction: column;
  }

  .panel,
  .panel.wide {
    min-width: 100%;
  }
}
</style>

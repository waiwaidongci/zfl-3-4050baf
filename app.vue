<script setup>
import { computed, onMounted, ref, watch } from 'vue';

const today = new Date();
const iso = (offset = 0) => {
  const date = new Date(today);
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
};

const members = ['阿岚', '梁序', '小北', '陈默'];
const currentUser = ref('阿岚');
const tab = ref('装备库');
const category = ref('全部分类');
const requestFilter = ref('全部申请');
const form = ref({ name: '', category: '帐篷天幕', owner: '阿岚', available: iso(2), deposit: '100', status: '可借', notes: '' });
const requestForm = ref({ gearId: '', borrower: '梁序', start: iso(2), end: iso(4), reason: '' });

const gears = ref([
  { id: crypto.randomUUID(), name: '双人轻量帐', category: '帐篷天幕', owner: '阿岚', available: iso(1), deposit: '200', status: '可借', notes: '含地钉和防潮垫', damage: '' },
  { id: crypto.randomUUID(), name: '炉头套装', category: '炊具', owner: '梁序', available: iso(0), deposit: '80', status: '借出中', notes: '需自备气罐', damage: '' },
  { id: crypto.randomUUID(), name: '营地灯三件组', category: '照明', owner: '小北', available: iso(3), deposit: '50', status: '可借', notes: '满电交接', damage: '' }
]);

const requests = ref([
  { id: crypto.randomUUID(), gearId: gears.value[1].id, gearName: '炉头套装', owner: '梁序', borrower: '阿岚', start: iso(-1), end: iso(2), status: '已同意', reason: '周末湖边露营', damage: '' },
  { id: crypto.randomUUID(), gearId: gears.value[2].id, gearName: '营地灯三件组', owner: '小北', borrower: '陈默', start: iso(3), end: iso(5), status: '待处理', reason: '夜钓备用', damage: '' }
]);

onMounted(() => {
  const storedGears = localStorage.getItem('zfl-3-gears');
  const storedRequests = localStorage.getItem('zfl-3-requests');
  if (storedGears) gears.value = JSON.parse(storedGears);
  if (storedRequests) requests.value = JSON.parse(storedRequests);
});

watch(gears, (value) => localStorage.setItem('zfl-3-gears', JSON.stringify(value)), { deep: true });
watch(requests, (value) => localStorage.setItem('zfl-3-requests', JSON.stringify(value)), { deep: true });

const categories = computed(() => ['全部分类', ...new Set(gears.value.map((gear) => gear.category))]);
const filteredGears = computed(() => gears.value.filter((gear) => category.value === '全部分类' || gear.category === category.value));
const requestList = computed(() => requests.value.filter((item) => requestFilter.value === '全部申请' || item.status === requestFilter.value));
const myOut = computed(() => requests.value.filter((item) => item.owner === currentUser.value));
const myIn = computed(() => requests.value.filter((item) => item.borrower === currentUser.value));

function addGear() {
  if (!form.value.name.trim()) return;
  gears.value = [{ id: crypto.randomUUID(), ...form.value, damage: '' }, ...gears.value];
  form.value = { name: '', category: '帐篷天幕', owner: currentUser.value, available: iso(2), deposit: '100', status: '可借', notes: '' };
}

function applyGear() {
  const gear = gears.value.find((item) => item.id === requestForm.value.gearId);
  if (!gear || !requestForm.value.borrower) return;
  requests.value = [{ id: crypto.randomUUID(), gearId: gear.id, gearName: gear.name, owner: gear.owner, status: '待处理', damage: '', ...requestForm.value }, ...requests.value];
  requestForm.value = { gearId: '', borrower: currentUser.value, start: iso(2), end: iso(4), reason: '' };
}

function updateRequest(id, status) {
  const record = requests.value.find((item) => item.id === id);
  requests.value = requests.value.map((item) => item.id === id ? { ...item, status } : item);
  if (record && status === '已同意') {
    gears.value = gears.value.map((gear) => gear.id === record.gearId ? { ...gear, status: '借出中' } : gear);
  }
}

function returnGear(record) {
  const damage = prompt('记录损耗情况，没有则填写无', '无');
  requests.value = requests.value.map((item) => item.id === record.id ? { ...item, status: '已归还', damage: damage || '无' } : item);
  gears.value = gears.value.map((gear) => gear.id === record.gearId ? { ...gear, status: '可借', damage: damage || '无' } : gear);
}
</script>

<template>
  <main>
    <header class="hero">
      <div>
        <p>露营装备共享社群</p>
        <h1>装备借用工作台</h1>
      </div>
      <label>
        当前成员
        <select v-model="currentUser">
          <option v-for="member in members" :key="member">{{ member }}</option>
        </select>
      </label>
    </header>

    <nav class="tabs">
      <button v-for="item in ['装备库','申请列表','我的借出','我的借入']" :key="item" :class="{ active: tab === item }" @click="tab = item">{{ item }}</button>
    </nav>

    <section class="metrics">
      <article><strong>{{ gears.length }}</strong><span>登记装备</span></article>
      <article><strong>{{ gears.filter((item) => item.status === '可借').length }}</strong><span>当前可借</span></article>
      <article><strong>{{ requests.filter((item) => item.status === '待处理').length }}</strong><span>待处理申请</span></article>
      <article><strong>{{ requests.filter((item) => item.status === '已归还').length }}</strong><span>完成归还</span></article>
    </section>

    <section v-if="tab === '装备库'" class="layout">
      <form class="panel" @submit.prevent="addGear">
        <h2>登记装备</h2>
        <input v-model="form.name" placeholder="装备名称" />
        <select v-model="form.category">
          <option>帐篷天幕</option>
          <option>炊具</option>
          <option>照明</option>
          <option>桌椅收纳</option>
          <option>安全急救</option>
        </select>
        <select v-model="form.owner">
          <option v-for="member in members" :key="member">{{ member }}</option>
        </select>
        <div class="split">
          <input v-model="form.available" type="date" />
          <input v-model="form.deposit" placeholder="押金" />
        </div>
        <textarea v-model="form.notes" placeholder="使用注意事项"></textarea>
        <button>保存装备</button>
      </form>

      <div class="panel wide">
        <div class="toolbar">
          <h2>装备库</h2>
          <select v-model="category">
            <option v-for="item in categories" :key="item">{{ item }}</option>
          </select>
        </div>
        <div class="cards">
          <article v-for="gear in filteredGears" :key="gear.id">
            <strong>{{ gear.name }}</strong>
            <span>{{ gear.category }} · {{ gear.owner }}</span>
            <p>{{ gear.status }} · 可借日期{{ gear.available }} · 押金{{ gear.deposit }}</p>
            <small>{{ gear.notes }}</small>
          </article>
        </div>
      </div>
    </section>

    <section v-if="tab === '申请列表'" class="layout">
      <form class="panel" @submit.prevent="applyGear">
        <h2>发起借用</h2>
        <select v-model="requestForm.gearId">
          <option value="">选择装备</option>
          <option v-for="gear in gears.filter((item) => item.status === '可借')" :key="gear.id" :value="gear.id">{{ gear.name }}</option>
        </select>
        <select v-model="requestForm.borrower">
          <option v-for="member in members" :key="member">{{ member }}</option>
        </select>
        <div class="split">
          <input v-model="requestForm.start" type="date" />
          <input v-model="requestForm.end" type="date" />
        </div>
        <textarea v-model="requestForm.reason" placeholder="借用说明"></textarea>
        <button>提交申请</button>
      </form>
      <div class="panel wide">
        <div class="toolbar">
          <h2>申请流转</h2>
          <select v-model="requestFilter">
            <option>全部申请</option>
            <option>待处理</option>
            <option>已同意</option>
            <option>已拒绝</option>
            <option>已归还</option>
          </select>
        </div>
        <div class="requestList">
          <article v-for="item in requestList" :key="item.id">
            <div>
              <strong>{{ item.gearName }}</strong>
              <span>{{ item.borrower }}申请 · {{ item.start }}至{{ item.end }}</span>
            </div>
            <p>{{ item.status }} · 装备主人{{ item.owner }} · {{ item.reason }}</p>
            <div class="actions" v-if="item.status === '待处理'">
              <button @click="updateRequest(item.id, '已同意')">同意</button>
              <button class="ghost" @click="updateRequest(item.id, '已拒绝')">拒绝</button>
            </div>
            <button v-if="item.status === '已同意'" class="ghost" @click="returnGear(item)">登记归还</button>
          </article>
        </div>
      </div>
    </section>

    <section v-if="tab === '我的借出' || tab === '我的借入'" class="panel">
      <h2>{{ tab }}</h2>
      <div class="requestList">
        <article v-for="item in (tab === '我的借出' ? myOut : myIn)" :key="item.id">
          <strong>{{ item.gearName }}</strong>
          <span>{{ item.status }} · {{ item.borrower }} · {{ item.start }}至{{ item.end }}</span>
          <p>损耗记录：{{ item.damage || '暂无' }}</p>
        </article>
      </div>
    </section>
  </main>
</template>

<style>
* { box-sizing: border-box; }
body { margin: 0; background: #f2f4ed; color: #22251f; font-family: Inter, "PingFang SC", Arial, sans-serif; }
button, input, select, textarea { font: inherit; }
main { min-height: 100vh; padding: 28px; }
.hero { display: flex; justify-content: space-between; gap: 20px; align-items: end; padding: 30px; border-radius: 8px; color: #fff; background: linear-gradient(135deg, #263623, #84704f); }
.hero p { margin: 0 0 6px; opacity: .8; }
h1 { margin: 0; font-size: clamp(32px, 5vw, 56px); letter-spacing: 0; }
h2 { margin: 0; font-size: 18px; }
.hero label { display: grid; gap: 8px; min-width: 190px; }
.tabs { display: flex; flex-wrap: wrap; gap: 8px; margin: 16px 0; }
.tabs button { background: #fff; color: #303427; border: 1px solid #d8dccf; }
.tabs .active { background: #2f4a2c; color: #fff; }
.metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 16px; }
.metrics article, .panel, .cards article, .requestList article { background: #fff; border: 1px solid #dfe3d5; border-radius: 8px; padding: 18px; box-shadow: 0 10px 28px rgb(33 42 27 / .07); }
.metrics strong { display: block; font-size: 28px; }
.metrics span, article span, p, small { color: #63705d; }
.layout { display: grid; grid-template-columns: 340px 1fr; gap: 16px; align-items: start; }
form.panel { display: flex; flex-direction: column; gap: 10px; }
input, select, textarea { width: 100%; border: 1px solid #cfd8ca; border-radius: 8px; padding: 11px 12px; background: #fff; color: #22251f; }
textarea { min-height: 96px; resize: vertical; }
button { border: 0; border-radius: 8px; padding: 11px 14px; background: #2f4a2c; color: #fff; cursor: pointer; }
.ghost { background: #edf1e8; color: #2c3527; }
.split { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.toolbar { display: flex; justify-content: space-between; gap: 12px; align-items: center; margin-bottom: 14px; }
.toolbar select { max-width: 220px; }
.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 12px; }
article strong, article span { display: block; }
article span { margin-top: 5px; }
.requestList { display: grid; gap: 10px; }
.actions { display: flex; gap: 8px; margin-top: 10px; }
@media (max-width: 900px) { main { padding: 16px; } .hero, .toolbar { flex-direction: column; align-items: start; } .metrics, .layout, .split { grid-template-columns: 1fr; } }
</style>

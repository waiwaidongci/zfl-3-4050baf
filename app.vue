<script setup>
import { computed, onMounted, ref, watch } from 'vue';

const today = new Date();
const iso = (offset = 0) => {
  const date = new Date(today);
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
};

const defaultMembers = [
  { id: crypto.randomUUID(), nickname: '阿岚', phone: '', area: '', notes: '' },
  { id: crypto.randomUUID(), nickname: '梁序', phone: '', area: '', notes: '' },
  { id: crypto.randomUUID(), nickname: '小北', phone: '', area: '', notes: '' },
  { id: crypto.randomUUID(), nickname: '陈默', phone: '', area: '', notes: '' }
];

const members = ref(defaultMembers);
const currentUser = ref('阿岚');
const tab = ref('装备库');
const category = ref('全部分类');
const requestFilter = ref('全部申请');
const form = ref({ name: '', category: '帐篷天幕', owner: '阿岚', available: iso(2), deposit: '100', status: '可借', notes: '' });
const requestForm = ref({ gearId: '', borrower: '梁序', start: iso(2), end: iso(4), reason: '' });

const memberForm = ref({ nickname: '', phone: '', area: '', notes: '' });
const editingMemberId = ref(null);
const deleteWarning = ref('');

const maintenanceTypes = ['清洁', '维修', '补件', '检查'];
const maintenanceForm = ref({ gearId: '', date: iso(0), type: '清洁', description: '', handler: '' });
const maintenanceFilter = ref('全部装备');

const gears = ref([
  { id: crypto.randomUUID(), name: '双人轻量帐', category: '帐篷天幕', owner: '阿岚', available: iso(1), deposit: '200', status: '可借', notes: '含地钉和防潮垫', damage: '' },
  { id: crypto.randomUUID(), name: '炉头套装', category: '炊具', owner: '梁序', available: iso(0), deposit: '80', status: '借出中', notes: '需自备气罐', damage: '' },
  { id: crypto.randomUUID(), name: '营地灯三件组', category: '照明', owner: '小北', available: iso(3), deposit: '50', status: '可借', notes: '满电交接', damage: '' }
]);

const requests = ref([
  { id: crypto.randomUUID(), gearId: gears.value[1].id, gearName: '炉头套装', owner: '梁序', borrower: '阿岚', start: iso(-1), end: iso(2), status: '已同意', reason: '周末湖边露营', damage: '' },
  { id: crypto.randomUUID(), gearId: gears.value[2].id, gearName: '营地灯三件组', owner: '小北', borrower: '陈默', start: iso(3), end: iso(5), status: '待处理', reason: '夜钓备用', damage: '' }
]);

function findGearForMaintenance(record, gearList = gears.value) {
  return gearList.find((gear) => gear.id === record.gearId)
    || gearList.find((gear) => gear.name === record.gearName && gear.owner === record.owner);
}

function normalizeMaintenanceRecords(records, gearList = gears.value) {
  return records
    .map((record) => {
      const gear = findGearForMaintenance(record, gearList);
      return gear ? { ...record, gearId: gear.id, gearName: gear.name, owner: gear.owner } : null;
    })
    .filter(Boolean);
}

function createDefaultMaintenanceRecords(gearList = gears.value) {
  const findGear = (name, owner) => gearList.find((gear) => gear.name === name && gear.owner === owner);
  const tent = findGear('双人轻量帐', '阿岚');
  const stove = findGear('炉头套装', '梁序');
  return [
    tent && { id: crypto.randomUUID(), gearId: tent.id, gearName: tent.name, owner: tent.owner, date: iso(-7), type: '清洁', description: '内外帐全面擦拭，通风晾干', handler: '阿岚' },
    tent && { id: crypto.randomUUID(), gearId: tent.id, gearName: tent.name, owner: tent.owner, date: iso(-20), type: '检查', description: '检查地钉和防风绳，状态良好', handler: '阿岚' },
    stove && { id: crypto.randomUUID(), gearId: stove.id, gearName: stove.name, owner: stove.owner, date: iso(-3), type: '补件', description: '更换了新的密封圈和点火电极', handler: '梁序' }
  ].filter(Boolean);
}

const maintenanceRecords = ref(createDefaultMaintenanceRecords());

onMounted(() => {
  const storedMembers = localStorage.getItem('zfl-3-members');
  const storedGears = localStorage.getItem('zfl-3-gears');
  const storedRequests = localStorage.getItem('zfl-3-requests');
  const storedMaintenance = localStorage.getItem('zfl-3-maintenance');
  if (storedMembers) members.value = JSON.parse(storedMembers);
  if (storedGears) gears.value = JSON.parse(storedGears);
  if (storedRequests) requests.value = JSON.parse(storedRequests);
  maintenanceRecords.value = storedMaintenance
    ? normalizeMaintenanceRecords(JSON.parse(storedMaintenance), gears.value)
    : createDefaultMaintenanceRecords(gears.value);
});

watch(members, (value) => localStorage.setItem('zfl-3-members', JSON.stringify(value)), { deep: true });
watch(gears, (value) => localStorage.setItem('zfl-3-gears', JSON.stringify(value)), { deep: true });
watch(requests, (value) => localStorage.setItem('zfl-3-requests', JSON.stringify(value)), { deep: true });
watch(maintenanceRecords, (value) => localStorage.setItem('zfl-3-maintenance', JSON.stringify(value)), { deep: true });

const categories = computed(() => ['全部分类', ...new Set(gears.value.map((gear) => gear.category))]);
const filteredGears = computed(() => gears.value.filter((gear) => category.value === '全部分类' || gear.category === category.value));
const requestList = computed(() => requests.value.filter((item) => requestFilter.value === '全部申请' || item.status === requestFilter.value));
const myOut = computed(() => requests.value.filter((item) => item.owner === currentUser.value));
const myIn = computed(() => requests.value.filter((item) => item.borrower === currentUser.value));

const myGears = computed(() => gears.value.filter((gear) => gear.owner === currentUser.value));
const validMaintenanceRecords = computed(() =>
  maintenanceRecords.value.filter((r) => gears.value.some((g) => g.id === r.gearId))
);
const maintenanceGearOptions = computed(() => ['全部装备', ...new Set(validMaintenanceRecords.value.map((r) => r.gearName))]);
const filteredMaintenance = computed(() => {
  return maintenanceFilter.value === '全部装备'
    ? validMaintenanceRecords.value
    : validMaintenanceRecords.value.filter((r) => r.gearName === maintenanceFilter.value);
});
const lastMaintenanceByGear = computed(() => {
  const map = {};
  for (const record of validMaintenanceRecords.value) {
    if (!map[record.gearId] || record.date > map[record.gearId].date) {
      map[record.gearId] = record;
    }
  }
  return map;
});
const maintenanceCount = computed(() => validMaintenanceRecords.value.length);

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

function saveMember() {
  if (!memberForm.value.nickname.trim()) return;
  if (editingMemberId.value) {
    const oldMember = members.value.find((m) => m.id === editingMemberId.value);
    const oldNickname = oldMember ? oldMember.nickname : '';
    const newNickname = memberForm.value.nickname.trim();
    members.value = members.value.map((m) =>
      m.id === editingMemberId.value
        ? { ...m, nickname: newNickname, phone: memberForm.value.phone, area: memberForm.value.area, notes: memberForm.value.notes }
        : m
    );
    if (oldNickname !== newNickname) {
      gears.value = gears.value.map((g) => g.owner === oldNickname ? { ...g, owner: newNickname } : g);
      requests.value = requests.value.map((r) => ({
        ...r,
        owner: r.owner === oldNickname ? newNickname : r.owner,
        borrower: r.borrower === oldNickname ? newNickname : r.borrower
      }));
      maintenanceRecords.value = maintenanceRecords.value.map((r) => ({
        ...r,
        owner: r.owner === oldNickname ? newNickname : r.owner,
        handler: r.handler === oldNickname ? newNickname : r.handler
      }));
      if (currentUser.value === oldNickname) currentUser.value = newNickname;
      if (form.value.owner === oldNickname) form.value.owner = newNickname;
      if (requestForm.value.borrower === oldNickname) requestForm.value.borrower = newNickname;
    }
    editingMemberId.value = null;
  } else {
    members.value = [{ id: crypto.randomUUID(), nickname: memberForm.value.nickname.trim(), phone: memberForm.value.phone, area: memberForm.value.area, notes: memberForm.value.notes }, ...members.value];
  }
  memberForm.value = { nickname: '', phone: '', area: '', notes: '' };
}

function editMember(member) {
  editingMemberId.value = member.id;
  memberForm.value = { nickname: member.nickname, phone: member.phone, area: member.area, notes: member.notes };
}

function cancelEditMember() {
  editingMemberId.value = null;
  memberForm.value = { nickname: '', phone: '', area: '', notes: '' };
}

function deleteMember(member) {
  const nickname = member.nickname;
  const gearCount = gears.value.filter((g) => g.owner === nickname).length;
  const borrowCount = requests.value.filter((r) => r.borrower === nickname).length;
  const ownCount = requests.value.filter((r) => r.owner === nickname).length;
  const maintenanceOwnerCount = maintenanceRecords.value.filter((r) => r.owner === nickname).length;
  const maintenanceHandlerCount = maintenanceRecords.value.filter((r) => r.handler === nickname).length;
  if (gearCount > 0 || borrowCount > 0 || ownCount > 0 || maintenanceOwnerCount > 0 || maintenanceHandlerCount > 0) {
    const reasons = [];
    if (gearCount > 0) reasons.push(`${gearCount}件登记装备`);
    if (ownCount > 0) reasons.push(`${ownCount}条作为出借人的申请`);
    if (borrowCount > 0) reasons.push(`${borrowCount}条作为借用人的申请`);
    if (maintenanceOwnerCount > 0) reasons.push(`${maintenanceOwnerCount}条装备保养记录`);
    if (maintenanceHandlerCount > 0) reasons.push(`${maintenanceHandlerCount}条作为处理人的保养记录`);
    deleteWarning.value = `无法删除「${nickname}」：该成员关联了${reasons.join('、')}，请先处理关联数据。`;
    return;
  }
  members.value = members.value.filter((m) => m.id !== member.id);
  if (currentUser.value === nickname && members.value.length > 0) {
    currentUser.value = members.value[0].nickname;
  }
  deleteWarning.value = '';
}

function dismissWarning() {
  deleteWarning.value = '';
}

function addMaintenance() {
  const gear = gears.value.find((g) => g.id === maintenanceForm.value.gearId);
  if (!gear) return;
  if (gear.owner !== currentUser.value) {
    alert('仅装备主人可登记保养记录');
    return;
  }
  const handler = maintenanceForm.value.handler.trim() || currentUser.value;
  maintenanceRecords.value = [{
    id: crypto.randomUUID(),
    gearId: gear.id,
    gearName: gear.name,
    owner: gear.owner,
    date: maintenanceForm.value.date,
    type: maintenanceForm.value.type,
    description: maintenanceForm.value.description,
    handler
  }, ...maintenanceRecords.value];
  maintenanceForm.value = { gearId: '', date: iso(0), type: '清洁', description: '', handler: '' };
}

function deleteMaintenance(id) {
  if (!confirm('确定删除该保养记录？')) return;
  maintenanceRecords.value = maintenanceRecords.value.filter((r) => r.id !== id);
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
          <option v-for="member in members" :key="member.id">{{ member.nickname }}</option>
        </select>
      </label>
    </header>

    <nav class="tabs">
      <button v-for="item in ['装备库','申请列表','保养记录','成员资料','我的借出','我的借入']" :key="item" :class="{ active: tab === item }" @click="tab = item">{{ item }}</button>
    </nav>

    <section class="metrics">
      <article><strong>{{ gears.length }}</strong><span>登记装备</span></article>
      <article><strong>{{ gears.filter((item) => item.status === '可借').length }}</strong><span>当前可借</span></article>
      <article><strong>{{ requests.filter((item) => item.status === '待处理').length }}</strong><span>待处理申请</span></article>
      <article><strong>{{ maintenanceCount }}</strong><span>保养记录</span></article>
      <article><strong>{{ members.length }}</strong><span>社群成员</span></article>
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
          <option v-for="member in members" :key="member.id">{{ member.nickname }}</option>
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
            <div v-if="lastMaintenanceByGear[gear.id]" class="maintenance-badge" style="margin-top: 10px; padding: 8px 10px; background: #edf1e8; border-radius: 6px; font-size: 12px;">
              <span style="color: #2f4a2c; font-weight: 600;">最近保养：</span>
              <span>{{ lastMaintenanceByGear[gear.id].date }} · {{ lastMaintenanceByGear[gear.id].type }}</span>
              <div v-if="lastMaintenanceByGear[gear.id].description" style="margin-top: 4px; color: #63705d;">
                {{ lastMaintenanceByGear[gear.id].description }}
              </div>
            </div>
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
          <option v-for="member in members" :key="member.id">{{ member.nickname }}</option>
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

    <section v-if="tab === '保养记录'" class="layout">
      <form class="panel" @submit.prevent="addMaintenance">
        <h2>登记保养</h2>
        <select v-model="maintenanceForm.gearId">
          <option value="">选择装备</option>
          <option v-for="gear in myGears" :key="gear.id" :value="gear.id">{{ gear.name }}</option>
        </select>
        <input v-model="maintenanceForm.date" type="date" />
        <select v-model="maintenanceForm.type">
          <option v-for="t in maintenanceTypes" :key="t">{{ t }}</option>
        </select>
        <input v-model="maintenanceForm.handler" placeholder="处理人（默认为当前成员）" />
        <textarea v-model="maintenanceForm.description" placeholder="保养说明（清洁部位、维修内容、补充零件、检查结果等）"></textarea>
        <button>保存记录</button>
        <small v-if="myGears.length === 0" class="muted">当前成员名下暂无装备，无法登记保养记录。</small>
      </form>

      <div class="panel wide">
        <div class="toolbar">
          <h2>保养记录</h2>
          <select v-model="maintenanceFilter">
            <option v-for="opt in maintenanceGearOptions" :key="opt">{{ opt }}</option>
          </select>
        </div>
        <div v-if="filteredMaintenance.length === 0" class="muted" style="padding: 20px; text-align: center;">暂无保养记录</div>
        <div v-else class="requestList">
          <article v-for="record in filteredMaintenance" :key="record.id">
            <div>
              <strong>{{ record.gearName }}</strong>
              <span>{{ record.date }} · {{ record.type }} · 处理人 {{ record.handler }}</span>
            </div>
            <p>装备主人：{{ record.owner }}</p>
            <p v-if="record.description" style="margin-top: 6px;">{{ record.description }}</p>
            <div class="actions" v-if="record.owner === currentUser">
              <button class="ghost small danger" @click="deleteMaintenance(record.id)">删除</button>
            </div>
          </article>
        </div>
      </div>
    </section>

    <section v-if="tab === '成员资料'" class="layout">
      <form class="panel" @submit.prevent="saveMember">
        <h2>{{ editingMemberId ? '编辑成员' : '添加成员' }}</h2>
        <input v-model="memberForm.nickname" placeholder="昵称" />
        <input v-model="memberForm.phone" placeholder="联系电话" />
        <input v-model="memberForm.area" placeholder="常用露营区域" />
        <textarea v-model="memberForm.notes" placeholder="备注"></textarea>
        <div class="split">
          <button>{{ editingMemberId ? '保存修改' : '添加成员' }}</button>
          <button v-if="editingMemberId" type="button" class="ghost" @click="cancelEditMember">取消</button>
        </div>
      </form>

      <div class="panel wide">
        <div class="toolbar">
          <h2>成员列表</h2>
          <span class="muted">共 {{ members.length }} 人</span>
        </div>

        <div v-if="deleteWarning" class="warning">
          <span>{{ deleteWarning }}</span>
          <button class="ghost small" @click="dismissWarning">关闭</button>
        </div>

        <div class="memberList">
          <article v-for="member in members" :key="member.id" class="member-card">
            <div class="member-info">
              <strong>{{ member.nickname }}</strong>
              <span v-if="member.phone">📞 {{ member.phone }}</span>
              <span v-if="member.area">🏕 {{ member.area }}</span>
              <small v-if="member.notes">{{ member.notes }}</small>
            </div>
            <div class="actions">
              <button class="ghost small" @click="editMember(member)">编辑</button>
              <button class="ghost small danger" @click="deleteMember(member)">删除</button>
            </div>
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
.metrics { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; margin-bottom: 16px; }
.metrics article, .panel, .cards article, .requestList article { background: #fff; border: 1px solid #dfe3d5; border-radius: 8px; padding: 18px; box-shadow: 0 10px 28px rgb(33 42 27 / .07); }
.metrics strong { display: block; font-size: 28px; }
.metrics span, article span, p, small { color: #63705d; }
.layout { display: grid; grid-template-columns: 340px 1fr; gap: 16px; align-items: start; }
form.panel { display: flex; flex-direction: column; gap: 10px; }
input, select, textarea { width: 100%; border: 1px solid #cfd8ca; border-radius: 8px; padding: 11px 12px; background: #fff; color: #22251f; }
textarea { min-height: 96px; resize: vertical; }
button { border: 0; border-radius: 8px; padding: 11px 14px; background: #2f4a2c; color: #fff; cursor: pointer; }
.ghost { background: #edf1e8; color: #2c3527; }
.ghost.small { padding: 6px 12px; font-size: 13px; }
.ghost.danger { color: #9b2c2c; }
.split { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.toolbar { display: flex; justify-content: space-between; gap: 12px; align-items: center; margin-bottom: 14px; }
.toolbar select { max-width: 220px; }
.muted { color: #63705d; font-size: 14px; }
.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 12px; }
article strong, article span { display: block; }
article span { margin-top: 5px; }
.requestList, .memberList { display: grid; gap: 10px; }
.warning { background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 12px 16px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; gap: 12px; color: #92400e; font-size: 14px; }
.member-card { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
.member-info { flex: 1; }
.member-info small { display: block; margin-top: 6px; }
.actions { display: flex; gap: 8px; margin-top: 10px; }
@media (max-width: 900px) { main { padding: 16px; } .hero, .toolbar { flex-direction: column; align-items: start; } .metrics, .layout, .split { grid-template-columns: 1fr; } .member-card { flex-direction: column; } }
</style>

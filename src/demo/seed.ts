import { randomBytes, randomUUID } from "node:crypto";
import { Role, type EntryKind, type EntryPriority, type EquipmentStatus, type PrismaClient, type WorkStatus, type Prisma } from "../generated/prisma/client.js";
import { hashPassword } from "../password.js";

export type DemoLanguage = "tr" | "en";
export type DemoRole = "worker" | "supervisor" | "manager";
type Text = readonly [tr: string, en: string];
type Unit = "GT1" | "GT2" | "ST" | null;

// Demo accounts are identified by this reserved domain. Seeding refuses to wipe
// a database that contains any other account unless explicitly forced.
export const DEMO_DOMAIN = "@demo.local";
export const demoAccounts: Record<DemoRole, { email: string; role: Role; name: Text }> = {
  worker: { email: `operator${DEMO_DOMAIN}`, role: Role.WORKER, name: ["Demo Operatör", "Demo Operator"] },
  supervisor: { email: `supervisor${DEMO_DOMAIN}`, role: Role.SUPERVISOR, name: ["Demo Vardiya Amiri", "Demo Supervisor"] },
  manager: { email: `manager${DEMO_DOMAIN}`, role: Role.MANAGER, name: ["Demo Yönetici", "Demo Manager"] }
};
export const isDemoRole = (value: unknown): value is DemoRole => typeof value === "string" && Object.hasOwn(demoAccounts, value);
const crew = ["Elif Kaya", "Murat Demir", "Selin Arslan", "Burak Yıldız"];

const teams = {
  mech: ["Mekanik bakım", "Mechanical maintenance"], elec: ["Elektrik bakım", "Electrical maintenance"],
  ops: ["Operasyon", "Operations"], ic: ["Enstrüman ve kontrol", "Instrumentation & control"], lab: ["Kimya laboratuvarı", "Chemistry lab"]
} satisfies Record<string, Text>;

interface Closed { kind: EntryKind; priority: EntryPriority; unit: Unit; team: Text; title: Text; description: Text; close: Text; hours: number }
const closedItems: Closed[] = [
  { kind: "TASK", priority: "NORMAL", unit: "GT1", team: teams.mech, hours: 14,
    title: ["GT1 yağ filtresi fark basıncı kontrolü", "GT1 lube oil filter differential pressure check"],
    description: ["Filtre fark basıncı 0,8 bar'a yükseldi. Değişim için mekanik bakım bilgilendirildi.", "Filter differential pressure rose to 0.8 bar. Mechanical maintenance notified for replacement."],
    close: ["Filtre değiştirildi, fark basıncı 0,2 bar.", "Filter replaced; differential pressure now 0.2 bar."] },
  { kind: "VALVE", priority: "HIGH", unit: "ST", team: teams.ic, hours: 30,
    title: ["ST bypass vanası BV-204 manuel konumda", "ST bypass valve BV-204 in manual"],
    description: ["Pozisyoner arızası nedeniyle vana manuelde %35 açıkta tutuluyor.", "Positioner fault; valve held in manual at 35% open."],
    close: ["Pozisyoner değiştirildi, vana otomatiğe alındı.", "Positioner replaced; valve returned to automatic."] },
  { kind: "TASK", priority: "NORMAL", unit: "GT2", team: teams.elec, hours: 6,
    title: ["GT2 jeneratör soğutma fanı titreşim ölçümü", "GT2 generator cooling fan vibration survey"],
    description: ["Rutin ölçüm planı kapsamında fan yataklarında titreşim ölçülecek.", "Measure fan bearing vibration as part of the routine survey."],
    close: ["Ölçümler normal sınırlarda (2,1 mm/s).", "Readings within limits (2.1 mm/s)."] },
  { kind: "TASK", priority: "NORMAL", unit: null, team: teams.lab, hours: 4,
    title: ["Kazan besi suyu iletkenlik analizi", "Boiler feedwater conductivity analysis"],
    description: ["Online analizör ile laboratuvar değeri arasında fark var, numune alınacak.", "Online analyser disagrees with lab value; take a grab sample."],
    close: ["Numune sonuçları limit içinde, analizör kalibre edildi.", "Sample within limits; analyser recalibrated."] },
  { kind: "VALVE", priority: "NORMAL", unit: "GT2", team: teams.ops, hours: 9,
    title: ["GT2 yakıt gazı drenaj vanası DV-112 açık", "GT2 fuel gas drain valve DV-112 open"],
    description: ["Hat drenajı için vana açıldı. Drenaj bitince kapatılmalı.", "Valve opened to drain the line. Close when draining is complete."],
    close: ["Drenaj tamamlandı, vana kapatıldı ve kilitlendi.", "Draining complete; valve closed and locked."] },
  { kind: "ATTENTION", priority: "NORMAL", unit: "ST", team: teams.ic, hours: 20,
    title: ["ST kondenser vakum transmitterinde sapma", "ST condenser vacuum transmitter drift"],
    description: ["İki kanal arasında 2,5 kPa fark görülüyor. Düşük okuyan kanal izlenmeli.", "2.5 kPa difference between channels. Watch the low-reading channel."],
    close: ["Transmitter kalibre edildi, kanallar arası fark 0,3 kPa.", "Transmitter calibrated; channel difference now 0.3 kPa."] },
  { kind: "TASK", priority: "HIGH", unit: "GT1", team: teams.mech, hours: 16,
    title: ["GT1 kompresör su yıkaması", "GT1 compressor water wash"],
    description: ["Kompresör verimi düştü. Planlı duruşta off-line yıkama yapılacak.", "Compressor efficiency dropped. Perform an off-line wash during the planned outage."],
    close: ["Yıkama tamamlandı, kompresör verimi %1,8 arttı.", "Wash complete; compressor efficiency up 1.8%."] },
  { kind: "TASK", priority: "NORMAL", unit: null, team: teams.ops, hours: 2,
    title: ["Yangın pompası haftalık test çalıştırması", "Weekly fire pump test run"],
    description: ["Dizel yangın pompası 15 dakika çalıştırılacak.", "Run the diesel fire pump for 15 minutes."],
    close: ["Pompa 15 dk çalıştı, çıkış basıncı 9,5 bar.", "Pump ran 15 min; discharge pressure 9.5 bar."] },
  { kind: "VALVE", priority: "NORMAL", unit: "ST", team: teams.mech, hours: 26,
    title: ["ST buhar hattı izolasyon vanası V-310 kaçak", "ST steam isolation valve V-310 gland leak"],
    description: ["Salmastradan hafif buhar kaçağı var. Bölge bariyerle ayrıldı.", "Minor steam leak from the gland. Area barricaded."],
    close: ["Salmastra sıkıldı, kaçak giderildi.", "Gland tightened; leak stopped."] },
  { kind: "ATTENTION", priority: "NORMAL", unit: "GT2", team: teams.ops, hours: 36,
    title: ["GT2 egzoz sıcaklık yayılımı yüksek", "GT2 exhaust temperature spread high"],
    description: ["Egzoz termokupl yayılımı 32°C. Yük değişimlerinde takip edilmeli.", "Exhaust thermocouple spread is 32°C. Monitor during load changes."],
    close: ["Yanma ayarı yapıldı, yayılım 18°C'ye düştü.", "Combustion tuned; spread down to 18°C."] },
  { kind: "TASK", priority: "NORMAL", unit: null, team: teams.elec, hours: 5,
    title: ["UPS akü kapasite testi", "UPS battery capacity test"],
    description: ["Aylık kapasite testi yapılacak, kritik yükler bypass'a alınmayacak.", "Monthly capacity test; critical loads stay on UPS."],
    close: ["Test başarılı, otonomi 42 dakika.", "Test passed; 42 minutes autonomy."] },
  { kind: "ATTENTION", priority: "HIGH", unit: "ST", team: teams.ops, hours: 18,
    title: ["ST yağlama yağı sıcaklığı alarm sınırında", "ST lube oil temperature near alarm"],
    description: ["Yağ sıcaklığı 56°C, alarm 58°C. Soğutucu su debisi kontrol edilmeli.", "Oil at 56°C, alarm at 58°C. Check cooler water flow."],
    close: ["Yağ soğutucusu temizlendi, sıcaklık 48°C.", "Oil cooler cleaned; temperature now 48°C."] },
  { kind: "TASK", priority: "NORMAL", unit: "GT2", team: teams.ic, hours: 7,
    title: ["GT2 IGV pozisyon geri bildirim kontrolü", "GT2 IGV position feedback check"],
    description: ["IGV komut ve geri bildirim arasında %1,5 fark var.", "1.5% mismatch between IGV demand and feedback."],
    close: ["LVDT ayarlandı, fark %0,2.", "LVDT adjusted; mismatch now 0.2%."] }
];

interface Open { kind: EntryKind; priority: EntryPriority; unit: Unit; team: Text; status: WorkStatus; hoursAgo: number; title: Text; description: Text; next: Text; updates: Text[] }
const openItems: Open[] = [
  { kind: "TASK", priority: "HIGH", unit: "GT2", team: teams.mech, status: "IN_PROGRESS", hoursAgo: 50,
    title: ["GT2 planlı bakım: yanma odası boroskop muayenesi", "GT2 planned outage: combustor borescope inspection"],
    description: ["Planlı bakım kapsamında yanma odası ve türbin 1. kademe boroskopla incelenecek. Ünite bakımda.", "Borescope the combustor and first turbine stage during the planned outage. Unit is in maintenance."],
    next: ["Muayene raporunu bekle, bulguları vardiya amirine ilet.", "Wait for the inspection report and pass findings to the supervisor."],
    updates: [["Yakıt gazı izolasyonu ve LOTO tamamlandı.", "Fuel gas isolation and LOTO complete."], ["Boroskop ekibi sahada, yanma odası 1-6 incelendi.", "Borescope team on site; combustors 1-6 inspected."], ["Kanister 4'te hafif termal renk değişimi, fotoğraflandı.", "Slight heat tint on can 4, photographed."]] },
  { kind: "ATTENTION", priority: "HIGH", unit: "GT1", team: teams.ops, status: "WAITING", hoursAgo: 36,
    title: ["GT1 #2 yatak titreşimi artıyor", "GT1 bearing #2 vibration trending up"],
    description: ["Son 48 saatte 3,1'den 4,4 mm/s'ye çıktı. Alarm sınırı 7,1 mm/s.", "Rose from 3.1 to 4.4 mm/s in 48 hours. Alarm limit is 7.1 mm/s."],
    next: ["Her vardiyada değeri kaydet; 5,5 mm/s üzerinde yük düşür ve amiri ara.", "Log the value every shift; above 5.5 mm/s reduce load and call the supervisor."],
    updates: [["Değer 4,1 mm/s, yük 160 MW.", "Reading 4.1 mm/s at 160 MW."], ["Değer 4,3 mm/s. Kestirimci bakım veri topladı.", "Reading 4.3 mm/s. Predictive maintenance collected data."], ["Değer 4,4 mm/s, trend yavaşladı.", "Reading 4.4 mm/s; trend slowing."], ["Analiz raporu yarın bekleniyor.", "Analysis report expected tomorrow."]] },
  { kind: "VALVE", priority: "HIGH", unit: "GT2", team: teams.mech, status: "IN_PROGRESS", hoursAgo: 49,
    title: ["GT2 yakıt gazı ana vanası kilitli (LOTO)", "GT2 main fuel gas valve locked out (LOTO)"],
    description: ["Bakım süresince vana kapalı ve kilitli. İzin no: İZ-2026-1187.", "Valve closed and locked for the outage. Permit no: PTW-2026-1187."],
    next: ["Bakım bitmeden kilidi açma; izin kapanışını amirle birlikte yap.", "Do not remove the lock before the outage ends; close the permit with the supervisor."],
    updates: [["Kilit ve etiket kontrol edildi, yerinde.", "Lock and tag checked, in place."]] },
  { kind: "TASK", priority: "NORMAL", unit: null, team: teams.elec, status: "WAITING", hoursAgo: 75,
    title: ["Trafo-2 soğutma fanı arızalı", "Transformer 2 cooling fan failed"],
    description: ["Fan-3 motoru çalışmıyor. Diğer fanlar devrede, yağ sıcaklığı normal.", "Fan 3 motor is down. Other fans running, oil temperature normal."],
    next: ["Yedek motor tedarik bekleniyor (tahmini 2 gün). Yağ sıcaklığını izle.", "Spare motor on order (about 2 days). Keep watching oil temperature."],
    updates: [["Satın alma talebi açıldı.", "Purchase request raised."], ["Tedarikçi sevkiyatı onayladı.", "Supplier confirmed shipment."]] },
  { kind: "ATTENTION", priority: "NORMAL", unit: null, team: teams.ic, status: "IN_PROGRESS", hoursAgo: 20,
    title: ["DCS operatör istasyonu OS-3 yavaş yanıt veriyor", "DCS operator station OS-3 responding slowly"],
    description: ["Ekran geçişleri 5-6 saniye sürüyor. OS-1 ve OS-2 normal.", "Screen changes take 5-6 seconds. OS-1 and OS-2 are normal."],
    next: ["I&C ekibi sistem loglarını inceliyor; kritik işlemleri OS-1'den yap.", "I&C is reviewing system logs; use OS-1 for critical operations."],
    updates: [["Disk doluluğu %94, log arşivi taşınıyor.", "Disk 94% full; moving log archive."]] },
  { kind: "TASK", priority: "NORMAL", unit: "GT1", team: teams.lab, status: "OPEN", hoursAgo: 10,
    title: ["GT1 yağ numunesi alınacak", "Take GT1 lube oil sample"],
    description: ["Titreşim takibi kapsamında yağ analizi istendi.", "Oil analysis requested as part of the vibration follow-up."],
    next: ["Gece vardiyasında numune al ve laboratuvara teslim et.", "Take the sample on night shift and hand it to the lab."], updates: [] },
  { kind: "VALVE", priority: "NORMAL", unit: "ST", team: teams.ops, status: "OPEN", hoursAgo: 6,
    title: ["ST drenaj vanası DV-221 kısmen açık", "ST drain valve DV-221 partly open"],
    description: ["Hat ısıtması için vana yarım tur açık bırakıldı.", "Valve left half a turn open to warm the line."],
    next: ["Hat sıcaklığı 250°C'yi geçince kapat ve kaydı kapat.", "Close once line temperature exceeds 250°C, then close this item."], updates: [] },
  { kind: "TASK", priority: "NORMAL", unit: "ST", team: teams.ops, status: "OPEN", hoursAgo: 3,
    title: ["Soğutma kulesi fan-3 devreye alma kontrolü", "Cooling tower fan 3 return-to-service check"],
    description: ["Redüktör bakımı bitti. Devreye almadan önce yağ seviyesi ve dönüş yönü kontrol edilecek.", "Gearbox service complete. Check oil level and rotation before starting."],
    next: ["Kontrol sonrası fanı devreye al, 30 dk titreşim izle.", "Start the fan after checks and watch vibration for 30 minutes."], updates: [] }
];

const logItems: { kind: EntryKind; unit: Unit; title: Text; description: Text }[] = [
  { kind: "EVENT", unit: null, title: ["Yük talebi 380 MW'a yükseltildi", "Load demand raised to 380 MW"], description: ["Yük dağıtım merkezi talimatıyla yük artırıldı.", "Load raised on dispatch instruction."] },
  { kind: "EVENT", unit: null, title: ["Şebeke frekans dalgalanması", "Grid frequency excursion"], description: ["Frekans 49,85 Hz'e düştü, primer frekans kontrolü devreye girdi.", "Frequency dipped to 49.85 Hz; primary frequency response engaged."] },
  { kind: "NOTE", unit: null, title: ["Vardiya devri yapıldı", "Shift handover completed"], description: ["Açık işler ve uyarılar gelen ekiple birlikte gözden geçirildi.", "Open items and alerts reviewed with the incoming crew."] },
  { kind: "EVENT", unit: null, title: ["Yangın alarm paneli rutin testi", "Fire alarm panel routine test"], description: ["Bölge 1-4 test edildi, arıza yok.", "Zones 1-4 tested, no faults."] },
  { kind: "EVENT", unit: "ST", title: ["ST gece yük düşümü", "ST night-time load reduction"], description: ["Talep düştüğü için blok yükü 220 MW'a indirildi.", "Block load reduced to 220 MW on lower demand."] },
  { kind: "NOTE", unit: null, title: ["Saha turu tamamlandı", "Plant walkdown completed"], description: ["Yağmur nedeniyle açık alan kontrolleri kısa tutuldu, anormallik yok.", "Outdoor checks kept short due to rain; nothing abnormal."] },
  { kind: "EVENT", unit: null, title: ["Su arıtma rejenerasyonu tamamlandı", "Water treatment regeneration complete"], description: ["Katyon ve anyon kolonları rejenere edildi.", "Cation and anion beds regenerated."] },
  { kind: "NOTE", unit: null, title: ["Kimyasal sevkiyatı teslim alındı", "Chemical delivery received"], description: ["Sodyum hipoklorit tankı dolduruldu, irsaliye arşivlendi.", "Sodium hypochlorite tank filled; delivery note filed."] },
  { kind: "EVENT", unit: "GT1", title: ["GT1 yük artışı", "GT1 load increase"], description: ["Ünite 170 MW baz yüke alındı.", "Unit raised to 170 MW base load."] },
  { kind: "NOTE", unit: null, title: ["Acil durum tatbikatı", "Emergency drill"], description: ["Tahliye tatbikatı 6 dakikada tamamlandı.", "Evacuation drill completed in 6 minutes."] }
];

const DAY = 86_400_000, HOUR = 3_600_000;
const slots = [["00:00", "08:00"], ["08:00", "16:00"], ["16:00", "00:00"]] as const;
// Turkey has used a fixed UTC+3 offset since 2016.
const istanbulDate = (time: Date) => new Date(time.getTime() + 3 * HOUR).toISOString().slice(0, 10);
const slotStart = (date: string, slot: number) => new Date(`${date}T${slots[slot]![0]}:00+03:00`);

/** Deterministic PRNG so every reset produces the same story relative to "now". */
function random(seed: number) {
  return () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export class DemoSeedRefusedError extends Error {}

export interface SeedOptions { now?: Date; language?: DemoLanguage; days?: number; force?: boolean }

/** Replaces every record in the database with a realistic demo plant history. */
export async function seedDemo(prisma: PrismaClient, options: SeedOptions = {}) {
  const now = options.now ?? new Date(), lang = options.language === "en" ? 1 : 0, days = options.days ?? 21;
  const t = (text: Text) => text[lang];
  const rand = random(20261124);
  const password = await hashPassword(randomBytes(32).toString("hex"));
  return prisma.$transaction(async tx => {
    // Serialise concurrent resets from several instances.
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(724501)`;
    const foreign = await tx.user.count({ where: { NOT: { email: { endsWith: DEMO_DOMAIN } } } });
    if (foreign > 0 && !options.force) {
      throw new DemoSeedRefusedError(`Demo seed refused: the database contains ${foreign} non-demo account(s). Use a dedicated demo database.`);
    }
    await wipe(tx);

    const users = new Map<string, number>();
    for (const [key, account] of Object.entries(demoAccounts)) {
      users.set(key, (await tx.user.create({ data: { email: account.email, name: t(account.name), role: account.role, password, createdAt: now } })).id);
    }
    for (const [index, name] of crew.entries()) {
      users.set(name, (await tx.user.create({ data: { email: `crew${index + 1}${DEMO_DOMAIN}`, name, role: Role.WORKER, password, createdAt: now } })).id);
    }
    const worker = users.get("worker")!, supervisor = users.get("supervisor")!;
    const rotation = [worker, ...crew.map(name => users.get(name)!)];

    // Three 8-hour slots per day; the slot containing "now" is the demo operator's active shift.
    const today = istanbulDate(now), currentSlot = slots.findIndex((_, i) => now >= slotStart(today, i) && (i === 2 || now < slotStart(today, i + 1)));
    const shiftRows: Prisma.ShiftCreateManyInput[] = [];
    for (let day = days; day >= 0; day--) {
      const date = istanbulDate(new Date(now.getTime() - day * DAY));
      for (let slot = 0; slot < 3; slot++) {
        if (day === 0 && slot > currentSlot) break;
        const start = slotStart(date, slot), active = day === 0 && slot === currentSlot;
        const userId = active ? worker : rotation[(day * 3 + slot) % rotation.length]!;
        const jitter = () => Math.round((rand() * 20 - 12) * 60_000);
        shiftRows.push({ userId, shiftDate: date, scheduledStart: slots[slot]![0], scheduledEnd: slots[slot]![1],
          startTime: new Date(start.getTime() + jitter()), status: active ? "ACTIVE" : "COMPLETED", createdAt: start,
          ...(active ? {} : { endTime: new Date(start.getTime() + 8 * HOUR + jitter()) }) });
      }
    }
    const shifts = (await tx.shift.createManyAndReturn({ data: shiftRows, select: { id: true, userId: true, startTime: true } }))
      .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
    const shiftAt = (time: Date) => [...shifts].reverse().find(shift => shift.startTime <= time) ?? shifts[0]!;
    const clamp = (time: number) => new Date(Math.min(time, now.getTime() - 5 * 60_000));

    // Closed board items spread across the history, cycling the templates.
    const spacing = (days * DAY) / 26;
    for (let i = 0; i < 26; i++) {
      const item = closedItems[i % closedItems.length]!;
      const createdAt = new Date(now.getTime() - days * DAY + i * spacing + rand() * spacing * 0.6);
      const closedAt = clamp(createdAt.getTime() + item.hours * HOUR * (0.7 + rand() * 0.6));
      if (closedAt <= createdAt) continue;
      const opener = shiftAt(createdAt), closer = shiftAt(closedAt);
      const progressAt = new Date((createdAt.getTime() + closedAt.getTime()) / 2);
      await tx.operationEntry.create({ data: {
        kind: item.kind, priority: item.priority, title: t(item.title), description: t(item.description), equipmentCode: item.unit,
        createdAt, authorId: opener.userId, shiftId: opener.id, closedAt, closedById: closer.userId, closeNote: t(item.close),
        workStatus: "IN_PROGRESS", responsibleTeam: t(item.team), nextStep: t(item.close), workVersion: 1,
        workChanges: { create: [
          { version: 0, workStatus: "OPEN", responsibleTeam: t(item.team), nextStep: "", authorId: opener.userId, createdAt },
          { version: 1, workStatus: "IN_PROGRESS", responsibleTeam: t(item.team), nextStep: t(item.close), authorId: shiftAt(progressAt).userId, createdAt: progressAt }
        ] }
      } });
    }

    for (const item of openItems) {
      const createdAt = new Date(now.getTime() - item.hoursAgo * HOUR), opener = shiftAt(createdAt);
      const step = (item.hoursAgo * HOUR) / (item.updates.length + 1);
      const updatedAt = new Date(createdAt.getTime() + step);
      const changed = item.status !== "OPEN";
      await tx.operationEntry.create({ data: {
        kind: item.kind, priority: item.priority, title: t(item.title), description: t(item.description), equipmentCode: item.unit,
        createdAt, authorId: opener.userId, shiftId: opener.id,
        workStatus: item.status, responsibleTeam: t(item.team), nextStep: t(item.next), workVersion: changed ? 1 : 0,
        workChanges: { create: [
          { version: 0, workStatus: "OPEN", responsibleTeam: t(item.team), nextStep: t(item.next), authorId: opener.userId, createdAt },
          ...(changed ? [{ version: 1, workStatus: item.status, responsibleTeam: t(item.team), nextStep: t(item.next), authorId: shiftAt(updatedAt).userId, createdAt: updatedAt }] : [])
        ] },
        updates: { create: item.updates.map((text, index) => {
          const at = new Date(createdAt.getTime() + step * (index + 1));
          return { body: t(text), authorId: shiftAt(at).userId, requestId: randomUUID(), createdAt: at };
        }) }
      } });
    }

    // Event and note log entries, roughly one every 8-16 hours.
    const logs: Prisma.OperationEntryCreateManyInput[] = [];
    for (let time = now.getTime() - days * DAY + 3 * HOUR, i = 0; time < now.getTime() - HOUR; time += (8 + rand() * 8) * HOUR, i++) {
      const item = logItems[i % logItems.length]!, at = new Date(time), shift = shiftAt(at);
      logs.push({ kind: item.kind, priority: "NORMAL", title: t(item.title), description: t(item.description), equipmentCode: item.unit, createdAt: at, authorId: shift.userId, shiftId: shift.id });
    }
    await tx.operationEntry.createMany({ data: logs });

    // Unit status history: GT1 tripped 9 days ago and recovered; GT2 entered its outage ~2 days ago.
    const history: { code: "GT1" | "GT2" | "ST"; from: EquipmentStatus; to: EquipmentStatus; hoursAgo: number; note: Text }[] = [
      { code: "GT1", from: "UNKNOWN", to: "ACTIVE", hoursAgo: days * 24, note: ["Devrede, baz yük.", "Online at base load."] },
      { code: "GT2", from: "UNKNOWN", to: "ACTIVE", hoursAgo: days * 24, note: ["Devrede.", "Online."] },
      { code: "ST", from: "UNKNOWN", to: "ACTIVE", hoursAgo: days * 24, note: ["Devrede.", "Online."] },
      { code: "GT1", from: "ACTIVE", to: "INACTIVE", hoursAgo: 9 * 24, note: ["Alev söndü alarmı ile trip.", "Tripped on loss of flame."] },
      { code: "GT1", from: "INACTIVE", to: "ACTIVE", hoursAgo: 9 * 24 - 4, note: ["Alev dedektörü temizlendi, yeniden senkronize edildi.", "Flame detector cleaned; resynchronised."] },
      { code: "GT2", from: "ACTIVE", to: "MAINTENANCE", hoursAgo: 50, note: ["Planlı bakım ve boroskop muayenesi sürüyor.", "Planned outage and borescope inspection in progress."] },
      { code: "GT1", from: "ACTIVE", to: "ACTIVE", hoursAgo: 30, note: ["#2 yatak titreşimi takip ediliyor.", "Monitoring bearing #2 vibration."] },
      { code: "ST", from: "ACTIVE", to: "ACTIVE", hoursAgo: 6, note: ["Drenaj vanası DV-221 kontrol edilecek.", "Drain valve DV-221 to be checked."] }
    ];
    for (const code of ["GT1", "GT2", "ST"] as const) {
      const changes = history.filter(change => change.code === code);
      let last: { at: Date; userId: number; to: EquipmentStatus; note: string } | null = null;
      for (const change of changes) {
        const at = new Date(now.getTime() - change.hoursAgo * HOUR), userId = change.hoursAgo >= days * 24 ? supervisor : shiftAt(at).userId;
        await tx.equipmentChange.create({ data: { equipmentCode: code, fromStatus: change.from, toStatus: change.to, note: t(change.note), userId, createdAt: at } });
        last = { at, userId, to: change.to, note: t(change.note) };
      }
      await tx.equipment.upsert({ where: { code }, create: { code, status: last!.to, note: last!.note, version: changes.length, updatedAt: last!.at, updatedById: last!.userId },
        update: { status: last!.to, note: last!.note, version: changes.length, updatedAt: last!.at, updatedById: last!.userId } });
    }
    await tx.operationRevision.upsert({ where: { id: 1 }, create: { id: 1, version: 1 }, update: { version: { increment: 1 } } });
    return { users: users.size, shifts: shifts.length, entries: 26 + openItems.length + logs.length };
  }, { timeout: 180_000, maxWait: 30_000 });
}

export async function wipe(tx: Prisma.TransactionClient) {
  await tx.handoverRead.deleteMany();
  await tx.operationUpdate.deleteMany();
  await tx.workDetailChange.deleteMany();
  await tx.operationPhoto.deleteMany();
  await tx.operationEntry.deleteMany();
  await tx.equipmentChange.deleteMany();
  await tx.equipment.updateMany({ data: { updatedById: null } });
  await tx.handover.deleteMany();
  await tx.report.deleteMany();
  await tx.log.deleteMany();
  await tx.shift.deleteMany();
  await tx.user.deleteMany();
}

/** True when demo data is missing or older than the reset interval. */
export async function demoNeedsReset(prisma: PrismaClient, maxAgeHours: number, now = new Date()) {
  const account = await prisma.user.findUnique({ where: { email: demoAccounts.manager.email }, select: { createdAt: true } });
  return !account || now.getTime() - account.createdAt.getTime() >= maxAgeHours * HOUR;
}

import { test } from "node:test";
import assert from "node:assert/strict";
import * as C from "../www/core.js";
import { ago, inDaysDate } from "./helpers.mjs";

test("health follows the ratio between days since contact and the wanted rhythm", () => {
  const p = f => ({ name: "X", freq: 30, log: [{ d: ago(f), t: "appel" }] });
  assert.equal(C.health(p(10)).state, "bloom");    // 0.33
  assert.equal(C.health(p(25)).state, "ok");       // 0.83
  assert.equal(C.health(p(40)).state, "thirsty");  // 1.33
  assert.equal(C.health(p(60)).state, "wilted");   // 2
  assert.equal(C.health({ name: "Y", freq: 30 }).state, "thirsty"); // never noted counts as overdue
});

test("the latest exchange wins across manual notes and synced sources", () => {
  const p = { name: "X", freq: 30, log: [{ d: ago(40) }], sync: { whatsapp: { last: ago(2) } } };
  const h = C.health(p);
  assert.equal(h.since, 2); assert.equal(h.src, "whatsapp");
});

test("this week favours overdue people and soon birthdays, skips snoozed and planned meetings", () => {
  const bd = inDaysDate(3);
  const people = [
    { id: "a", name: "Ana", freq: 30, log: [{ d: ago(60) }] },
    { id: "b", name: "Ben", freq: 30, log: [{ d: ago(5) }], bdDay: bd.getDate(), bdMonth: bd.getMonth() + 1 },
    { id: "c", name: "Cy", freq: 30, log: [{ d: ago(90) }], snoozeUntil: C.iso(inDaysDate(3)) },
    { id: "d", name: "Dee", freq: 30, log: [{ d: ago(90) }], sync: { agenda: { next: C.iso(inDaysDate(4)) } } },
    { id: "e", name: "Eve", freq: 30, log: [{ d: ago(3) }] }
  ];
  const week = C.pickWeek(C.withHealth(people)).map(x => x.p.name);
  assert.deepEqual(week, ["Ben", "Ana"]);
});

test("applyLog records the exchange, drops covered questions, adds new ones, clears snooze", () => {
  const p = { name: "X", asks: ["Comment va ta mère ?", "Le nouveau job ?"], log: [], snoozeUntil: "2099-01-01" };
  const out = C.applyLog(p, { d: "2026-10-20", t: "appel", n: "Super appel", doneAsks: ["le nouveau job ?"], newAsks: ["Photos du voyage ?"] });
  assert.equal(out.log[0].n, "Super appel");
  assert.deepEqual(out.asks, ["Comment va ta mère ?", "Photos du voyage ?"]);
  assert.equal(out.snoozeUntil, undefined);
  assert.deepEqual(p.asks.length, 2, "input is not mutated");
});

test("foldSync merges days, keeps the latest date and ignores future dates", () => {
  const now = new Date();
  const prev = { last: ago(10), days: [ago(10)], n: 1 };
  const out = C.foldSync(prev, { dates: [new Date(Date.now() - 2 * 864e5), new Date(Date.now() + 864e5)], n: 4 }, now);
  assert.equal(out.last, ago(2)); assert.deepEqual(out.days, [ago(2), ago(10)]); assert.equal(out.n, 4);
});

test("findByName accepts a unique first name only", () => {
  const people = [{ name: "Karim Benali" }, { name: "Léa Martin" }, { name: "Léa Dubois" }];
  assert.equal(C.findByName(people, "karim").name, "Karim Benali");
  assert.equal(C.findByName(people, "Lea"), null);
  assert.equal(C.findByName(people, "Léa Dubois").name, "Léa Dubois");
});

test("vCard: quoted-printable names, item-prefixed phones, birthdays without year", () => {
  const vcf = "BEGIN:VCARD\nFN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:H=C3=A9l=C3=A8ne\nTEL;CELL:0698765432\nBDAY:1991-04-12\nEND:VCARD\n" +
    "BEGIN:VCARD\nFN:Plombier\nitem1.TEL:01 23\nBDAY;VALUE=date:--10-30\nEND:VCARD";
  const [a, b] = C.parseVCF(vcf);
  assert.equal(a.name, "Hélène"); assert.deepEqual(a.bday, { y: 1991, m: 4, d: 12 });
  assert.deepEqual(b.phones, ["01 23"]); assert.deepEqual(b.bday, { y: null, m: 10, d: 30 });
});

test("Google CSV: multi-value cells", () => {
  const csv = "First Name,Last Name,Birthday,Phone 1 - Value,E-mail 1 - Value\nKarim,Benali,1990-02-14,+33 6 12 ::: 01 02,K@X.FR\n";
  const [k] = C.parseGoogleCSV(csv);
  assert.equal(k.name, "Karim Benali"); assert.deepEqual(k.phones, ["+33 6 12", "01 02"]); assert.deepEqual(k.emails, ["k@x.fr"]);
});

test("WhatsApp exports: Android and iPhone lines, chat name from the file name", () => {
  const android = "20/10/2026 14:32 - Les messages sont chiffrés.\n18/10/2026 09:01 - Hélène: Coucou\n19/10/2026 21:10 - Moi: Salut";
  const r = C.parseWA(android, "Discussion WhatsApp avec Hélène.txt", [{ name: "Hélène Dupré" }]);
  assert.equal(r.count, 2); assert.equal(r.chatName, "Hélène"); assert.equal(r.match.name, "Hélène Dupré");
  const ios = "[12/09/2026, 18:22:05] Karim: Bien arrivé\n[13/09/2026, 08:00:00] Moi: Top";
  const k = C.parseWA(ios, "WhatsApp Chat - Karim.zip", []);
  assert.equal(k.count, 2); assert.equal(C.iso(k.last), "2026-09-13");
});

test("calendar matching uses attendee e-mails and unique names in titles, never birthdays", () => {
  const people = [{ id: "k", name: "Karim Benali", emails: ["k@x.fr"] }, { id: "l", name: "Léa" }];
  const ei = C.emailIndex(people), keys = C.nameKeys(people);
  assert.deepEqual(C.eventPeople({ summary: "Dîner avec Karim", attendees: [] }, ei, keys).map(p => p.id), ["k"]);
  assert.deepEqual(C.eventPeople({ summary: "Point", attendees: [{ email: "K@X.fr" }] }, ei, keys).map(p => p.id), ["k"]);
  assert.deepEqual(C.eventPeople({ summary: "Anniversaire de Léa" }, ei, keys), []);
});

test("AI context leaves out phones and e-mails", () => {
  const b = C.personBrief({ id: "1", name: "X", phones: ["0600"], emails: ["x@y.z"], notes: "n", log: [] });
  assert.ok(!JSON.stringify(b).includes("0600")); assert.ok(!JSON.stringify(b).includes("x@y.z"));
  const d = C.circleDigest([{ name: "Demo", demo: true }, { name: "Real", freq: 30 }]);
  assert.deepEqual(d.people.map(p => p.name), ["Real"]);
});

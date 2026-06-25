# EOS AV/UC Scope of Work — House Style

This is the source of truth for how an EOS delivery Scope of Work (SOW) is written.
It is used as the system prompt for SOW generation. The generator must follow it exactly.
Derived from real delivered SOWs (Jones Day NY Rev6, Centene MPR Rev9).

---

## 1. SOW mode

The app writes a **delivery SOW**: a committed, BOM-traceable scope.
Voice is "EOS will provide and install …", third person, future tense, declarative.

Do NOT write in the persuasive "design / bake-off" voice ("EOS would propose / would
recommend …", design-philosophy prose, room-type groupings, "look ahead" sections).
That is a separate mode and is out of scope unless explicitly requested.

Context: the design/bake-off mode is used to win a NEW customer in a competitive pitch
(e.g. Nike Chicago Bake Off). The delivery mode is used to quote defined work for an
EXISTING customer against a finalized BOM (e.g. Centene, Jones Day). The app targets the
delivery mode.

---

## 2. Document identity (top of every SOW)

- **Running header line:** `EOS IT Management Solutions  |  <ProjectNumber>  |  <ProjectName>`
- **Title (bold):** `<ProjectNumber>  <ProjectName>`
- **Subtitle (bold):** the room/space configuration, e.g.
  - `2-Way Divisible Conference Suite — Rooms 3401A and 3401B`
  - `3-Way Divisible Room (Rooms 202, 203, and 206)`
- **Basis statement (italic, optional but preferred):**
  > *This Scope of Work is based on the RFP documents provided for the <ProjectName>
  > project (the technical write-up and the project bill of materials). The equipment,
  > quantities, and system configuration described herein reflect those documents and are
  > subject to confirmation during design review and site survey.*

This basis/hedge line is important — it protects against overcommitment. Keep it.

---

## 3. Section order

The section set is flexible, but order follows this spine. Include only sections the BOM
and project actually warrant; never pad with empty sections.

1. **Executive Summary** (a.k.a. "Project Summary" / "Room Executive Summary")
2. **Room Environment** / **Room Environment Overview**
3. **Combine / Divide Operation** or **Combined-Mode Operation** *(only for divisible rooms)*
4. System sections — **Video, Audio, Conferencing, Control** *(see §4 for nesting)*
5. **Network** / **Room Conferencing Switch** *(switch, PoE, VLAN plan)*
6. **Rack, Power, and Peripherals**
7. **Equipment to be Removed and Returned to Owner**
8. **Standard Exceptions and Clarifications**
9. **<Client> Specific Project Requirements** *(Within the Quote / Start of Installation /
   At Completion)* — largely client-supplied; if absent from inputs, omit or mark TBD.

---

## 4. Two valid organizations — pick from the BOM

- **Room-first** (use when rooms are discrete or there are only one or two mirrored rooms):
  each Room gets its own `Display / Video / Audio / Conferencing / Control / Network &
  Peripherals` subsections. (Jones Day pattern.)
- **Suite-first** (use when rooms form a divisible suite that shares infrastructure):
  the suite gets shared `Video / Audio / Conferencing / Control / Combined-Mode / Switch /
  Rack` sections describing all rooms together, then a per-suite removal list. (Centene pattern.)

If the subtitle says "X-Way Divisible," default to suite-first for that suite. A project can
contain more than one suite (Centene has a 3-Way and a 2-Way); write each suite as its own block.

---

## 5. The sentence engine (core voice)

- **Equipment provision:**
  `EOS will provide and install <qty-word> (<qty-num>) **<Manufacturer Model>** <plain-English role>.`
  - e.g. `EOS will provide and install two (2) **Samsung QM85C 85″ 4K UHD displays** on two (2) **Chief XTM1U Micro-Adjust Tilt wall mounts**.`
- **Quantities:** spell out + numeral — `two (2)`, `sixteen (16)`. At a sentence/clause start, a
  bare `(3)` is acceptable. Always match the BOM quantity exactly.
- **Bold** every Manufacturer + Model on first mention in a section.
- **Describe function and signal flow, not just the part.** Say what a device does, what it
  connects to, and where it sits. This is the single most important style rule — it is what
  makes the SOW read like an AV engineer wrote it.
  - Good: "one (1) **QSC NV-21-HU** configured as an encoder on the codec HDMI output,
    streaming the codec's program output onto the AV-over-IP network."
  - Bad: "one (1) QSC NV-21-HU."
- **Owner-Furnished Equipment (OFE) / existing-to-remain**, called out per section:
  `**OFE:** The existing <items> remain in place and are reused; EOS will incorporate them into the new system.`
  (See §5.1 — OFE is NOT the same as removed equipment.)
- **Group by system within a room/suite** in this order: Display, Video, Audio, Conferencing,
  Control, Network/Switch, Rack/Power/Peripherals.

### 5.1 OFE / existing-to-remain vs. removed equipment — two separate sources

**Default rule: anything shown as existing or OFE under a Location/System in the BOM is STAYING.**
This is the normal case and usually the only signal available. Such equipment is reused — either
actively integrated with the new equipment (e.g. existing ceiling speakers driven by a new
amplifier, or an existing projector controlled through a new relay) or simply retained as-is
because it works and the customer did not ask to replace it. It is shown so the design accounts
for everything in the room. Write it as remaining and, where applicable, incorporated; include it
even when nothing is being done to it.

**Removals are the exception and come from a SEPARATE source — never from the BOM.** Equipment is
marked for demolition only when as-built / existing-system drawings (or an explicit demolition
list) are provided that call it out for removal. Those drawings are a distinct, optional input,
separate from the BOM, and EOS does not usually have them.

Therefore:
- **BOM only (the usual case):** every line is new or OFE/existing-staying. There is NO "Equipment
  to be Removed" section, because no source says anything is removed. Do not manufacture one.
- **BOM + demo / as-built drawings (e.g. the Centene case):** the items those drawings call out for
  demo populate the removals section; everything in the BOM still defaults to staying.

Never infer a removal from an OFE flag, and never invent removals when no demo source is provided.
### 5.2 Accessory tiers — what to name, fold, or summarize

Not all "accessories" are equal. Tier each BOM line and handle it accordingly:

- TIER A — Loose patch cables / jumpers (HDMI, USB-A/B/C, DisplayPort, short
  pre-terminated network patch cords): do NOT list individually. Cover them with ONE
  catch-all sentence in the relevant system, e.g. "EOS will provide all necessary HDMI,
  USB-A/B/C, and network patch cables to interconnect the system." This sentence is
  optional/editable — include it when such cables exist in the BOM.

- TIER B — Bulk / spooled / quantity cable (cable on spools, plenum bulk runs,
  speaker wire by the foot/spool): NAME it with quantity and purpose, e.g. "EOS will
  provide three (3) spools of CAT6A cable for video and control distribution." Do not
  bury these in the catch-all.

- TIER C — Infrastructure accessories that are real deliverables (table boxes, floor
  boxes, poke-throughs, cable retractors, floor track/raceway, cubbies, grommets,
  furniture-integrated connectivity): these MUST be called out, grouped under their
  Location and System exactly as the BOM groups them, with their function. They are
  deliverables, not folded prose.

- TIER D — Device mounting hardware (display mounts, projector mounts, camera brackets,
  rack shelves/ears): fold into the parent device sentence ("on (2) Chief XTM1U wall
  mounts"). Never a standalone line.

- TIER E — Service/support contracts, warranties, e-waste, generic "miscellaneous"
  lines: do not narrate as equipment. A contract may be noted once in Client-Specific
  Requirements if relevant; otherwise omit.

When unsure whether a cable is Tier A or B, prefer naming it (Tier B) if it has a
spool/bulk/length unit or a meaningful quantity; otherwise treat as Tier A.
---

## 6. Section content requirements (what each must cover)

- **Executive Summary:** what the project is; the room/suite configuration; which room is
  primary/host when combined; what existing infrastructure is decommissioned (name it); what
  the new system is built around; what is reused. One dense paragraph per suite.
- **Room Environment:** room type; dimensions (W×L×H) if known; existing infrastructure to
  remain (OFE); divisible logic (partition sensors and what they automate). Bullet the
  "Existing Infrastructure to Remain" and "Divisible Logic" points.
- **Video:** displays/projectors (model, size, mounts) + distribution method (AV-over-IP or
  matrix) + per-room encoder/decoder provisioning + signal flow + lectern/wall-plate inputs.
- **Audio:** ceiling array + gooseneck + wireless mics; DSP/Q-SYS Core; amplifiers; speakers
  (often OFE); voice-lift behavior; how audio integrates with the codec; combine-mode mix bus.
- **Conferencing:** codec + cameras + camera extenders + Room Navigators (table + wall);
  content sharing (ClickShare / wired); camera-tracking behavior and how it's driven.
- **Control:** the control surface (Cisco Room Navigator / Crestron / Q-SYS — note when no
  third-party processor is needed); partition sensors; relay control of projector lift / screen;
  custom programming scope (combine/divide logic, UI extensions, macros).
- **Combined-Mode Operation:** master vs secondary; what routes to the master; what is locked
  out in secondary rooms; and an explicit "out of scope" list (e.g. cross-room camera tracking,
  composed multi-room layouts) so expectations are bounded.
- **Network / Switch:** switch model and port count; PoE budget; the planned VLAN scheme
  (list the VLANs, marked "subject to <Client> IT confirmation"); uplink to corporate network;
  coordination with the Owner's IT department.
- **Rack, Power, and Peripherals:** rack location; IP-controlled power (e.g. Middle Atlantic
  RLNK); what the Owner provides (circuits, data ports, pathways).
- **Equipment to be Removed and Returned to Owner:** include this section ONLY when a separate
  demo / as-built source provides removal items. Itemize `(qty) <Manufacturer Model> <description>
  (location)`; state the hardware is inventoried and handed to the owner. With BOM-only input,
  omit this section entirely.
- **Standard Exceptions and Clarifications:** the standard exclusions — building power /
  circuits / conduit; network gear not listed; structured cabling and penetrations not
  specified; corporate network/IP/DHCP; millwork/casework/finish work; permits/fees/overtime;
  sales tax; anything not expressly described in the SOW and BOM.
- **<Client> Specific Project Requirements:** project-specific (asset tags, cabling specs,
  CTS commissioning, warranty terms, payment terms, kickoff requirements). These come from the
  client/RFP — if not provided as input, omit the section or mark items TBD. Never invent them.

---

## 7. Anti-hallucination rules (hard)

- Every Manufacturer, Model, and Quantity named MUST come from the BOM. Never invent equipment,
  model numbers, or quantities, and never change a BOM quantity to make a sentence read better.
- OFE / existing-to-remain items come from the BOM (anything shown existing/OFE under a
  Location/System is staying). Removals come ONLY from a separate demo / as-built source and are
  never inferred from the BOM (see §5.1). No demo source provided → no removals section.
- Integration/signal-flow detail that the BOM does not determine should be described generically
  or flagged for review — do not fabricate specifics. VLAN numbers, port maps, and IT-dependent
  values are written only as a proposed plan "subject to <Client> IT confirmation."
- When in doubt, hedge with "subject to confirmation during design review and site survey."
- Do not output pricing, labor hours, or totals — the SOW narrative is scope only.

---

## 8. Boilerplate (reusable, lightly customized)

"Standard Exceptions and Clarifications" is near-verbatim across projects — keep it consistent,
slotting in the client name. Roles/responsibilities boilerplate (from the formal proposal) can be
appended when requested. Treat these as templates with the client name as the only variable.

---

## 9. Tone

Professional, dense, technical, confident but appropriately hedged. No marketing language in a
delivery SOW. Prefer precise nouns and signal-path verbs over adjectives. Sentences can be long
when they trace a signal path, but each must stay readable.
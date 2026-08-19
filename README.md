# HA EMS Cards

Dashboardkaarten voor energiebeheer in Home Assistant, in dezelfde huisstijl als de
[Zaptec Go 2 Card](https://github.com/Thedeed99/zaptec-go2-card): je koppelt alleen je
entiteiten in de UI en kiest je eigen achtergrond-, accent- en tekstkleur.

![HACS](https://img.shields.io/badge/HACS-Custom-orange.svg)
![Version](https://img.shields.io/badge/Version-1.0.0-blue.svg)

## Kaarten

### EMS Overzicht (`custom:ems-overview-card`)

Vervangt de bovenste tegel van je dashboard:

- Titel bovenaan (bijv. *Real-time verbruik*)
- Weer met temperatuur
- Vrij aantal tegels met een grote waarde (W/kWh) en optioneel een tweede regel
- Balk **Energiestroom** met schaal (0 – max W), iconen links/rechts en animatie zodra er stroom loopt

### EMS Apparaten (`custom:ems-devices-card`)

Vervangt de rasters met `button-card`:

- Raster met naam boven en het vermogen groot eronder
- Waarde wordt rood zodra de gekoppelde schakelaar uit staat
- Tikken schakelt het apparaat (of opent meer-info als er geen schakelaar is)
- Instelbaar aantal kolommen

## Installatie

1. HACS → **Custom repositories** → `https://github.com/Thedeed99/ha-ems-cards`, type **Dashboard**
2. Downloaden en Home Assistant herstarten
3. Dashboard → kaart toevoegen → **EMS Overzicht** of **EMS Apparaten**

## Configuratie

Alles kan via de UI-editor. Gedeelde weergave-opties voor beide kaarten:

| Optie | Standaard | Omschrijving |
|---|---|---|
| `background_color` | `#1d3b33` | Achtergrondkleur |
| `accent_color` | `#e8c547` | Accentkleur (balk, actieve iconen) |
| `text_color` | `#ffffff` | Tekstkleur |
| `off_color` | `#ff453a` | Kleur van de waarde als de schakelaar uit staat |
| `tile_radius` | `16` | Afronding van de hoeken in px |
| `columns` | `3` | Aantal kolommen |
| `title` | – | Titel bovenaan de kaart |

### EMS Overzicht

| Optie | Omschrijving |
|---|---|
| `weather_entity` | Weer-entiteit voor icoon en temperatuur |
| `tiles` | Lijst met `entity`, `name`, `secondary_entity`, `switch_entity`, `decimals` |
| `flow_entity` | Sensor voor de energiestroom (positief = import) |
| `flow_max` | Schaal van de balk in W (standaard 2500) |
| `flow_left_icon` / `flow_right_icon` | Iconen aan weerszijden van de balk |

### EMS Apparaten

| Optie | Omschrijving |
|---|---|
| `devices` | Lijst met `entity` (vermogen), `name`, `switch_entity`, `decimals` |

### Voorbeeld

```yaml
type: custom:ems-overview-card
title: Real-time verbruik
weather_entity: weather.forecast_thuis
flow_entity: sensor.import_export
flow_max: 2500
columns: 3
tiles:
  - entity: sensor.solaredge_i1_ac_power
    name: Zonne-energie
    secondary_entity: sensor.solaredge_energieopbrengst_vandaag
  - entity: sensor.daadwerkelijk_verbruik
    name: Verbruik
  - entity: sensor.import_export
    name: Import
  - entity: sensor.garage_laadpaal_zaptec_vermogen
    name: EV
  - entity: sensor.ongetraceerd_verbruik
    name: Ongetraceerd verbruik
  - entity: sensor.getraceerd_verbruik
    name: Getraceerd verbruik
```

```yaml
type: custom:ems-devices-card
columns: 3
devices:
  - entity: sensor.wasmachine_vermogen
    name: Wasmachine
    switch_entity: switch.wasmachine_schakelaar
  - entity: sensor.droger_vermogen
    name: Droger
    switch_entity: switch.droger_schakelaar
  - entity: sensor.vaatwasser_vermogen
    name: Vaatwasser
    switch_entity: switch.vaatwasser_schakelaar
```

## Licentie

MIT

# HA EMS Cards

Dashboardkaarten voor energiebeheer in Home Assistant, in dezelfde huisstijl als de
[Zaptec Go 2 Card](https://github.com/Thedeed99/zaptec-go2-card): je koppelt alleen je
entiteiten in de UI en kiest je eigen achtergrond-, accent- en tekstkleur.

![HACS](https://img.shields.io/badge/HACS-Custom-orange.svg)
![Version](https://img.shields.io/badge/Version-2.1.0-blue.svg)

## Kaarten

### EMS Overzicht (`custom:ems-overview-card`)

Vervangt de bovenste tegel van je dashboard:

- Titel bovenaan (bijv. *Real-time verbruik*)
- Weer met temperatuur
- **Zonnebalk** op schaal van je omvormer met gestapelde segmenten: zon naar huis, per verbruiker (vol = zon, doorzichtig = net), laadpaal, import en export, plus een gestreept vlak voor onbenutte laadcapaciteit en een stippellijn voor de verwachting
- Huis-, laadpaal- en neticoon die van kleur veranderen, en een batterijbalk met laadpercentage
- Zoef-animatie over de balk zodra er stroom loopt
- Tegels met actuele waarden en dagtotalen, inclusief netto import/export van vandaag
- Vrij aantal eigen tegels met een grote waarde en optioneel een tweede regel
- Balk **Energiestroom** met schaal (0 – max W), iconen links/rechts en zoef-animatie

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
| `production_entity` | Zonneproductie |
| `self_consumption_entity` | Huidig huisverbruik |
| `grid_power_entity` + `invert_grid_power` | Net (positief = export), of `import_entity` / `export_entity` |
| `inverter_size` | Schaal van de zonnebalk in kW |
| `ev_entity`, `ev_name`, `car_charger_load`, `ev_history_entity` | Laadpaal |
| `consumers` | Lijst met `entity`, `name`, `color`, `history_entity` |
| `battery_soc_entity`, `battery_power_entity` (+ `invert_battery_power`) of `battery_charge_entity` / `battery_discharge_entity`, `battery_capacity` | Thuisaccu |
| `production_history_entity`, `consumption_history_entity`, `import_history_entity`, `export_history_entity` | Dagtotalen in kWh |
| `power_unit`, `decimals`, `show_bar_values`, `show_solar_legend`, `show_stats`, `show_stats_detail`, `show_net_indicator`, `show_grid_icon_always` | Weergave |
| `disable_animation`, `animation_speed` | Zoef-animatie |

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

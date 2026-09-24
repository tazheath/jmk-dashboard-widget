# Dashboard Widget
 
Self-hosted salesman inventory dashboard. Lists available vehicles from an Airtable base with search and a location filter, and opens Airtable forms in a modal for common actions — add, edit price, replace photos, mark sold, and delete. Client-side only — no build step.
 
All changes flow through Airtable Forms and automations. The dashboard itself only **reads** data, so it runs on a read-only token.
 
Originally built for JMK Auto; designed to be reusable across dealerships by changing config values, not code.
 
## Files
 
| File | Role |
|------|------|
| `dashboard.js` | Dashboard logic. Builds its own markup and loads `dashboard.css` automatically. Served via jsDelivr. |
| `dashboard.css` | Styles. Loaded by `dashboard.js` from the same repo/commit. Served via jsDelivr. |
 
## Features
 
- **Search** by year, make, model, or VIN.
- **Location dropdown** (shown automatically when inventory spans more than one location).
- **Per-row actions:** Edit Price, Replace Photos, Mark Sold, and a ⋮ menu with **Delete**. Each opens its form with the VIN prefilled.
- **+ Add Vehicle** with **VIN Auto Fill**: enter a VIN and the form reloads prefilled with Year, Make, Model, Vehicle Type, Drive Type, and Transmission (decoded via the free NHTSA vPIC API — no key needed).
- **Open in new tab** link on every form, carrying the same prefilled values.
- Hides vehicles with `Status` = **`Sold`** or **`Archive`**.
## Embed
 
The embed is an **empty config div** plus the **script tag**:
 
```html
<div class="jmk-dash"
     data-location=""
     data-base-id="appoYop08wLow5fqF"
     data-token="patXXXXXXXXXXXXXX"
     data-form-add="https://airtable.com/embed/appXXXX/pagXXXX/form"
     data-form-price="https://airtable.com/embed/appXXXX/pagXXXX/form"
     data-form-photos="https://airtable.com/embed/appXXXX/pagXXXX/form"
     data-form-sold="https://airtable.com/embed/appXXXX/pagXXXX/form"
     data-form-archive="https://airtable.com/embed/appXXXX/pagXXXX/form"></div>
 
<script src="https://cdn.jsdelivr.net/gh/tazheath/jmk-dashboard-widget@8c2d53d8f764e48773402cf29c765fd578f85abb/dashboard.js" defer></script>
```
 
- Leave the div empty. Anything inside it is replaced when the dashboard loads.
- The dashboard stays hidden until its stylesheet loads (3-second fail-open), so the modal never flashes unstyled.
- Safe on the same page as the inventory widget — each loads only its own stylesheet.
### Duda
 
Duda doesn't run `<script>` tags placed inside HTML widgets:
 
- Put the **div** in an HTML widget.
- Put the **script tag** in **Settings → Head/Body HTML → Body-End HTML**.
Test on **Preview** or the **published** page — the editor canvas won't run it.
 
## Config (data-attributes on `.jmk-dash`)
 
| Attribute | Value | Notes |
|-----------|-------|-------|
| `data-location` | `Fairview`, `Ogden`, or `""` | Blank = all locations (shows the dropdown). Partial, case-insensitive match. |
| `data-base-id` | Airtable Base ID (`app…`) | From the base URL. |
| `data-token` | Airtable PAT (`pat…`) | **Read-only**, scoped to the one base. |
| `data-form-add` | Add New Vehicle form URL | Shows the **+ Add Vehicle** button and VIN Auto Fill. Omit to hide. |
| `data-form-price` | Update Vehicle Price form URL | **Edit Price** button. |
| `data-form-photos` | Replace Existing Photos form URL | **Replace Photos** button. |
| `data-form-sold` | Mark Vehicle Sold form URL | **Mark Sold** button. |
| `data-form-archive` | Archive Request form URL | Shows the **⋮ → Delete** menu. Omit to hide. |
 
Form URLs can be the `/embed/` link or a regular share link — share links are converted to embed links automatically.
 
## Airtable requirements
 
### Tables, forms, and automations
 
| Button | Form writes to | Automation |
|--------|----------------|------------|
| + Add Vehicle | `Vehicles` | — |
| Edit Price | `Price Changes` | Find VIN in Vehicles → update Price |
| Replace Photos | `Photo Updates` | Find VIN in Vehicles → replace Photos |
| Mark Sold | `Status Updates` | Find VIN in Vehicles → Status = Sold |
| Delete | `Archive Requests` | Find VIN in Vehicles → Status = Archive; then copy to `Archive` table and delete from Vehicles |
 
- Every edit form needs a **`VIN`** field — the dashboard prefills it with `prefill_VIN`.
- Every **Find records** step should include `Status is not Sold` and `Status is not Archive`, limited to 1 record, so a stale duplicate VIN is never matched.
### VIN Auto Fill field names
 
The Add New Vehicle form must have these fields, named exactly (case- and space-sensitive):
 
| Field | Prefilled values |
|-------|------------------|
| `VIN` | The entered VIN |
| `Year`, `Make`, `Model` | Decoded values |
| `Vehicle Type` | `Car`, `SUV`, `Truck`, `Minivan` |
| `Drive Type` | `FWD`, `RWD`, `AWD`, `4X4`, `4X2` |
| `Transmission` | `Automatic`, `Manual` |
 
Single-select option names must match these exactly, or that field is simply left blank. To change names or options for another dealer, edit the `VIN_DECODE` block at the top of `dashboard.js`.
 
### Token
 
- Scope: `data.records:read`, limited to this base only.
## Updating
 
1. Upload or commit the changed file(s).
2. Copy the new **full commit SHA** (commits page → copy icon on the latest commit).
3. Swap it into the `<script>` src. The stylesheet follows automatically from the same commit.
If you reference `@main` instead (fine for testing), jsDelivr caches it. Force a refresh after pushing:
 
```
https://purge.jsdelivr.net/gh/tazheath/jmk-dashboard-widget@main/dashboard.js
https://purge.jsdelivr.net/gh/tazheath/jmk-dashboard-widget@main/dashboard.css
```
 
## Security notes
 
- **Read-only token only.** The token sits in the page's HTML. It can't write, and inventory data is public anyway. Never put a write-scoped token in the embed.
- **Keep the dashboard page private.** The form links let anyone who opens the page add, reprice, mark sold, or delete vehicles. Put the dashboard on an unlisted, password-protected page, and don't link to it from the public site.
- **No real tokens in this repo.** It's public, and GitHub reports exposed Airtable tokens, which can get them revoked automatically. Keep real embed snippets in a private location.
 

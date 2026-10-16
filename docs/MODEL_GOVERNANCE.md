# FloodLens AI — Model Governance & Scientific Ethics

## 1. Ethical Stance on Machine Learning Claims

FloodLens AI adheres to strict engineering honesty: **Never claim a machine learning model is trained, validated, or production-ready unless actual ground-truth labeled training data was ingested and verified.**

In disaster decision-support, deceptive claims regarding AI readiness can lead to dangerous resource misallocation. When machine learning prerequisites (such as verified Sentinel-1 SAR ground-truth flood extents) are not present, the system:
1. Honestly discloses the untrained state of the machine learning classifier via API (`/api/v1/model/metadata`) and UI.
2. Operates an explicit, scientifically grounded multi-criteria decision analysis (MCDA) heuristic baseline.
3. Provides full mathematical transparency into how the baseline computes risk scores.

---

## 2. Baseline Formulation

The operational risk scoring engine evaluates infrastructure exposure through four normalized components:

$$\text{Risk Score}(a) = w_e \cdot S_{\text{elev}}(a) + w_r \cdot F_{\text{rain}} + w_c \cdot C(a)$$

Where:
- $S_{\text{elev}}(a)$: Elevation susceptibility factor (0.1 to 1.0) derived from SRTM-30 DEM.
  - $h \le 10\text{m MSL} \implies S = 1.0$ (active floodplain)
  - $10\text{m} < h \le 25\text{m} \implies S = 0.85$
  - $25\text{m} < h \le 50\text{m} \implies S = 0.65$
  - $50\text{m} < h \le 100\text{m} \implies S = 0.40$
  - $h > 100\text{m} \implies S = 0.10$
- $F_{\text{rain}}$: Catchment rainfall factor derived from Open-Meteo 24h accumulation:
  $$F_{\text{rain}} = \min\left(1.0, \frac{P_{24}}{100\text{ mm}}\right)$$
- $C(a)$: Infrastructure criticality multiplier:
  - Hospitals / Healthcare: $1.00$
  - Power Substations: $0.95$
  - Primary Bridges: $0.90$
  - Designated Relief Shelters: $0.85$
  - Schools / Community centers: $0.70$
- Weights: $w_e = 0.40, w_r = 0.35, w_c = 0.25$ (summing to $1.0$).

Risk Categories:
- **Critical:** $\text{Score} \ge 0.75$
- **High:** $0.50 \le \text{Score} < 0.75$
- **Medium:** $0.25 \le \text{Score} < 0.50$
- **Low:** $\text{Score} < 0.25$

---

## 3. Spatial Cross-Validation Strategy

When training the gradient-boosted XGBoost classifier on labeled flood observations, random k-fold cross-validation is forbidden due to spatial autocorrelation. Points geographically adjacent share nearly identical terrain and rainfall, leading to artificially inflated evaluation metrics (spatial data leakage).

FloodLens AI enforces **Spatial Block Cross-Validation**:
- The Chalakudy basin is partitioned into discrete geographic clusters using spatial k-means.
- The model trains on $K-1$ geographic blocks and is evaluated strictly on the held-out geographic block.
- Metrics reported include Area Under the Precision-Recall Curve (PR-AUC) and Brier calibration scores.

---

## 4. Human-in-the-Loop & Decision Support Boundaries

- FloodLens AI is an evaluative prototype, not an authorized agency of the Government of Kerala.
- Official disaster declarations, evacuation orders, and flood warnings remain the sole legal domain of the **Kerala State Disaster Management Authority (KSDMA)** and the **India Meteorological Department (IMD)**.
- Prominent banners in English and Malayalam reinforce this boundary across every screen.

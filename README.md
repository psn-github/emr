# TOP 3 ADVANCED KPI RECOMMENDATIONS
## Publication-Quality Visualizations for PowerPoint

**Date:** 6 November 2025  
**Authors:** Prof Scott Nelson Muirhead, Claude AI  
**Purpose:** Generate three strategic analysis visualizations for TFP KPI reporting

---

## 📋 OVERVIEW

This package contains three advanced analytical approaches that build on your existing KPI framework:

### **Recommendation #1: IVF vs ICSI Delta Analysis**
**Impact:** Most immediately actionable - changes treatment decisions  
**Insight:** Identifies clinics where one modality significantly outperforms the other  
**Action:** Optimize treatment selection, reduce ICSI overuse, improve cost-effectiveness

### **Recommendation #2: Multivariate Performance Matrix**
**Impact:** Shows strategic patterns your univariate analyses miss  
**Insight:** Comprehensive heatmap revealing consistent strengths/weaknesses across multiple KPIs  
**Action:** Strategic resource allocation, targeted improvement initiatives

### **Recommendation #3: Patient-Adjusted Outcomes**
**Impact:** Fair benchmarking - addresses the "Leiderdorp situation"  
**Insight:** Age-adjusted performance accounting for patient case mix complexity  
**Action:** Protects clinics treating older/complex patients, identifies true underperformance

---

## 📁 FILE STRUCTURE

```
/November 2025/
├── KPI data received/
│   ├── KPI_Nov_2025_GCRM.xlsm
│   ├── KPI_Nov_2025_BELFAST.xlsm
│   └── [other clinic files...]
├── 1_IVF_ICSI_Delta_Analysis.R
├── 2_Multivariate_Performance_Matrix.R
├── 3_Patient_Adjusted_Outcomes.R
├── RUN_ALL_RECOMMENDATIONS.R
└── README.md (this file)
```

---

## 🚀 QUICK START

### Option A: Run All Three Analyses (Recommended)

```R
# From RStudio, set working directory to November 2025 folder
setwd("path/to/November 2025")

# Execute all analyses
source("RUN_ALL_RECOMMENDATIONS.R")
```

**Execution time:** ~3-5 minutes  
**Output:** 10 PNG files + 3 CSV files

### Option B: Run Individual Analyses

```R
# Run only IVF vs ICSI analysis
source("1_IVF_ICSI_Delta_Analysis.R")

# Run only Multivariate Matrix
source("2_Multivariate_Performance_Matrix.R")

# Run only Patient-Adjusted Outcomes
source("3_Patient_Adjusted_Outcomes.R")
```

---

## 📊 OUTPUT FILES

### Recommendation #1 Outputs:
- **`RECOMMENDATION_1_IVF_ICSI_Delta.png`** ⭐ MAIN SLIDE
  - Bar chart showing fertilization rate differences (IVF minus ICSI)
  - Positive bars = IVF superior, Negative bars = ICSI superior
  - 14" × 10" @ 300 DPI

- **`RECOMMENDATION_1_Detailed_Comparison.png`** (Supporting)
  - Side-by-side comparison of IVF and ICSI rates by clinic
  - 16" × 10" @ 300 DPI

- **`RECOMMENDATION_1_Summary_Table.csv`**
  - Detailed data: rates, deltas, volumes, ICSI usage

### Recommendation #2 Outputs:
- **`RECOMMENDATION_2_Performance_Matrix.png`** ⭐ MAIN SLIDE
  - Comprehensive heatmap with Z-scores across 9 KPI dimensions
  - Red = below average, Green = above average
  - Includes hierarchical clustering
  - 16" × 10" @ 300 DPI

- **`RECOMMENDATION_2_Performance_Profiles.png`** (Supporting)
  - Line graph showing each clinic's profile across dimensions
  - 16" × 10" @ 300 DPI

- **`RECOMMENDATION_2_Overall_Ranking.png`** (Supporting)
  - Composite performance ranking with quartile categories
  - 14" × 10" @ 300 DPI

- **`RECOMMENDATION_2_Performance_Summary.csv`**
  - Z-scores for all metrics, overall scores, rankings

### Recommendation #3 Outputs:
- **`RECOMMENDATION_3_Age_Adjusted_Pregnancy.png`** ⭐ MAIN SLIDE
  - Scatter plot: Mean age vs pregnancy rate
  - Regression line showing expected performance
  - Points above/below line = better/worse than expected
  - 14" × 10" @ 300 DPI

- **`RECOMMENDATION_3_Value_Added_Ranking.png`** (Supporting)
  - Bar chart showing clinic value-added beyond patient age
  - 16" × 10" @ 300 DPI

- **`RECOMMENDATION_3_Expected_vs_Observed.png`** (Supporting)
  - Two-panel comparison: pregnancy and blastocyst rates
  - 16" × 8" @ 300 DPI

- **`RECOMMENDATION_3_Adjusted_Outcomes_Summary.csv`**
  - Demographics, observed rates, expected rates, value-added scores

---

## 💡 INTERPRETING THE RESULTS

### Recommendation #1: IVF vs ICSI Delta

**How to read the main chart:**
- **Positive values (green bars):** IVF fertilization > ICSI fertilization
  - Clinical implication: Potential ICSI overuse
  - Consider: Is ICSI truly indicated for all cases?
  
- **Negative values (red bars):** ICSI fertilization > IVF fertilization
  - Clinical implication: Strong sperm factor indications
  - Consider: IVF may not be appropriate for this patient mix

- **Large deltas (>5%):** Clinically significant differences
  - Action: Review treatment selection protocols

**Key questions this answers:**
1. Are we matching patients to the optimal fertilization method?
2. Where might we reduce unnecessary ICSI use?
3. Which clinics have mastered IVF technique?

### Recommendation #2: Multivariate Performance Matrix

**How to read the heatmap:**
- **Color coding:**
  - Dark green: Substantially above average (>1 SD)
  - Light green: Above average
  - White: Average performance
  - Light red: Below average
  - Dark red: Substantially below average (<-1 SD)

- **Numbers in cells:** Z-scores (standard deviations from mean)
  - Example: +1.5 = 1.5 SD above average = top ~7%
  - Example: -1.0 = 1 SD below average = bottom ~16%

- **Row clustering:** Clinics with similar overall profiles grouped together
  - Identifies peer groups
  - Reveals systematic strengths/weaknesses

**Key insights to look for:**
1. **Consistently green rows:** Overall strong performers
2. **Mixed patterns:** Specific strengths to leverage
3. **Consistently red rows:** Need comprehensive support
4. **Column patterns:** Network-wide strong/weak metrics

### Recommendation #3: Patient-Adjusted Outcomes

**How to read the scatter plot:**
- **Dashed line:** Expected pregnancy rate for each age
- **Points above line:** Exceeding age-adjusted expectations
- **Points below line:** Underperforming expectations
- **Distance from line:** Magnitude of value-added/subtracted

**Why this matters:**
- **The Leiderdorp problem:** Clinic treating older patients appears to underperform
- **This analysis shows:** Are they actually underperforming, or just treating harder cases?
- **Fair comparison:** Separates clinic effect from patient selection effect

**Value-Added interpretation:**
- **+5% value-added:** Clinic adds 5% pregnancy rate beyond what age predicts
- **-5% value-added:** Clinic subtracts 5% even accounting for patient age

---

## 🎯 POWERPOINT INTEGRATION

### Recommended Slide Structure:

**Slide 1: Title**
- "Advanced KPI Insights: Strategic Performance Analysis"
- Subtitle: "IVF Optimization, Multivariate Patterns, Fair Benchmarking"

**Slide 2: IVF vs ICSI Delta Analysis**
```
Title: "Treatment Modality Optimization Opportunities"
Image: RECOMMENDATION_1_IVF_ICSI_Delta.png
Bullet points:
• Positive values = IVF outperforms ICSI in fertilization
• Large deltas identify potential for protocol optimization
• [Clinic X] shows +7.3% advantage with IVF
• Consider: Is ICSI over-utilized where IVF would suffice?
```

**Slide 3: Multivariate Performance Matrix**
```
Title: "Comprehensive Performance Across All KPI Dimensions"
Image: RECOMMENDATION_2_Performance_Matrix.png
Bullet points:
• Green cells = above-average performance
• Red cells = below-average performance
• [Clinic Y] shows consistent strength across all metrics
• [Clinic Z] has specific weakness in blastocyst development
• Enables targeted improvement initiatives
```

**Slide 4: Age-Adjusted Fair Benchmarking**
```
Title: "Patient-Adjusted Performance: Fair Comparison"
Image: RECOMMENDATION_3_Age_Adjusted_Pregnancy.png
Bullet points:
• Accounts for patient age differences across clinics
• Points above line = exceeding age-adjusted expectations
• [Clinic A] adds +5.2% value beyond what patient age predicts
• Protects clinics treating older/more complex patients
• Identifies true underperformance vs demographic disadvantage
```

**Slide 5: Key Takeaways & Action Items**
```
Summary of strategic insights from all three analyses
Specific recommendations for each clinic
Timeline for follow-up and intervention
```

### Inserting Images into PowerPoint:

1. **Insert > Pictures > This Device**
2. Select PNG file
3. **Recommended sizing:**
   - Full slide: Resize to slide width (maintain aspect ratio)
   - Partial slide: 6-8 inches wide
4. **Image quality:** Files are 300 DPI - no quality loss when resizing

---

## 🔧 TECHNICAL DETAILS

### Required R Packages:
All packages are automatically installed if missing:
- `readxl` - Excel file reading
- `dplyr`, `tidyverse` - Data manipulation
- `ggplot2` - Visualization
- `scales` - Formatting
- `viridis` - Color palettes
- `pheatmap` - Heatmap creation
- `patchwork` - Multi-panel plots

### Data Requirements:
- Excel files must be in `KPI data received/` subfolder
- Files must follow TFP standard template structure
- Key rows used:
  - Row 3: Mean patient age
  - Row 5: Mean AMH
  - Row 10: Cycle volume
  - Rows 35-95: IVF/ICSI metrics
  - See scripts for complete row mapping

### Performance:
- **Runtime:** 3-5 minutes for all analyses
- **Memory:** ~500 MB
- **Disk space:** ~15 MB for all output files

---

## 🛠️ TROUBLESHOOTING

### Error: "Cannot find 'KPI data received' folder"
**Solution:** Ensure you're in the November 2025 folder before running scripts
```R
getwd()  # Check current directory
setwd("path/to/November 2025")  # Set correct directory
```

### Error: "No .xlsm files found"
**Solution:** Verify clinic files are in `KPI data received/` subfolder
```R
list.files("KPI data received/", pattern = "\\.xlsm$")
```

### Warning: "Failed to extract from [clinic].xlsm"
**Solution:** Check if that clinic's file follows standard template structure
- Script continues with other clinics
- Check error message for specific row/column issue

### Error: "Insufficient data for regression analysis"
**Solution:** At least 3 clinics with complete age and outcome data required
- Check which clinics have missing age or pregnancy rate data
- May need to exclude or impute missing values

### Plot appears blank or corrupted
**Solution:** Try re-running just that specific script
```R
source("1_IVF_ICSI_Delta_Analysis.R")  # Re-run individual script
```

---

## 📧 SUPPORT & CUSTOMIZATION

### Need Different Metrics?
The scripts are fully customizable. Key areas to modify:

**Add/remove KPIs:** Edit the `extract_comprehensive_kpis()` function in script #2

**Change color schemes:** Modify `scale_fill_manual()` or `scale_color_manual()` sections

**Adjust thresholds:** Change value-added thresholds (currently ±5%)

**Export different formats:** Change `ggsave()` parameters:
```R
ggsave("filename.pdf", plot = p, width = 14, height = 10)  # PDF instead of PNG
ggsave("filename.png", plot = p, dpi = 600)  # Higher resolution
```

### Request Additional Analyses?
These three recommendations are extensible:
- Age-stratified subgroup analyses
- Temporal trends in deltas
- Cost-effectiveness overlays
- Patient outcome trajectories

---

## 📚 STATISTICAL METHODS

### Recommendation #1: Delta Analysis
- **Method:** Simple difference in proportions (IVF 2PN rate - ICSI 2PN rate)
- **Advantage:** Intuitive, actionable
- **Limitation:** Doesn't account for patient selection differences

### Recommendation #2: Multivariate Matrix
- **Method:** Z-score standardization across clinics
  - Z = (X - μ) / σ
  - Where X = clinic value, μ = group mean, σ = group SD
- **Advantage:** Enables comparison across different-scale metrics
- **Limitation:** Assumes normal distribution

### Recommendation #3: Adjusted Outcomes
- **Method:** Linear regression with age as predictor
  - Expected = β₀ + β₁ × Age
  - Value-added = Observed - Expected
- **Advantage:** Fair comparison accounting for case mix
- **Limitation:** Assumes linear age-outcome relationship

---

## 📊 SAMPLE OUTPUTS

### What You'll See:

**Recommendation #1 Main Output:**
```
Clinic Performance Delta (IVF - ICSI 2PN Rate)
═══════════════════════════════════════════════
OXFD     ████████████ +7.3%    ← IVF superior
SIMP     ██████ +3.2%
GCRM     ██ +0.9%
BELF     │ 0.0%               ← Equal performance
WESX     ▐-1.5%
LEID     ████▌-4.8%           ← ICSI superior
```

**Recommendation #2 Main Output:**
```
Performance Matrix (Z-scores)
═════════════════════════════════════════════════════
Clinic    | Oocyte | IVF   | ICSI  | Blast | Preg |
          | Yield  | Fert  | Fert  | Dev   | Rate |
──────────┼────────┼───────┼───────┼───────┼──────┤
SIMP      │  1.2   │  1.5  │  0.8  │  1.1  │  1.3 │ ← Top performer
GCRM      │  0.6   │  0.9  │  0.3  │  0.7  │  0.5 │
BELF      │  0.2   │ -0.3  │  0.1  │ -0.2  │  0.0 │
LEID      │ -0.8   │ -0.9  │ -0.5  │ -1.1  │ -0.7 │
```

**Recommendation #3 Main Output:**
```
Age-Adjusted Pregnancy Rates
════════════════════════════════════════════════════
Expected vs Observed (based on mean age 37.5 years)
───────────────────────────────────────────────────
GCRM:    Expected: 52.1%   Observed: 57.3%  (+ 5.2%) ✓
OXFD:    Expected: 48.7%   Observed: 51.2%  (+ 2.5%) ✓
BELF:    Expected: 54.3%   Observed: 53.8%  (- 0.5%) ≈
LEID:    Expected: 45.2%   Observed: 42.1%  (- 3.1%) ✗
```

---

## ✅ VALIDATION CHECKLIST

Before presenting results:

- [ ] All PNG files created successfully
- [ ] All CSV files contain expected data
- [ ] No clinics excluded due to missing data (or exclusions documented)
- [ ] Regression R² > 0.3 for age-adjusted analysis
- [ ] Visual inspection of all plots confirms sensible results
- [ ] Extreme outliers investigated and explained
- [ ] Cross-reference with existing KPI reports for consistency

---

## 📜 VERSION HISTORY

**Version 1.0** (6 November 2025)
- Initial release
- Three core recommendation analyses
- Publication-quality visualizations

---

## 📄 LICENSE

Copyright © 2025 Prof Scott Nelson Muirhead, University of Glasgow  
Created for The Fertility Partnership (TFP)  
Internal use only - Confidential clinic performance data

---

**Ready to generate your PowerPoint-ready visualizations!**

Execute `RUN_ALL_RECOMMENDATIONS.R` and review outputs in ~5 minutes.

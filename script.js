// TNB Tariff Rates (RM/kWh)
// Formula: (Energy 27.03sen (>1500 is 37.03) + Capacity 4.55sen + Network 12.85sen) / 100
const RETAIL_TARIFF_LOW = 0.4443;  // For monthly usage <= 1500 kWh (27.03 + 4.55 + 12.85) / 100
const RETAIL_TARIFF_HIGH = 0.5443; // For monthly usage > 1500 kWh (37.03 + 4.55 + 12.85) / 100

// Fixed values as per requirements
const FIXED_SMP_RATE = 0.20; // Fixed at 0.20 RM/kWh
const FIXED_TARGET_SAVING = 100; // Fixed at 100%

// TNB Billing Logic from NEM Calculator
const rates = {
    domestic: {
        energy: 27.03, // sen/kWh
        energyHigh: 37.03, // sen/kWh for usage > 1500kWh
        capacity: 4.55, // sen/kWh
        network: 12.85, // sen/kWh
        retail: 10.00, // RM for usage > 600kWh,
    }
};

// Energy Efficiency Incentive rates (RM per kWh)
const incentiveRates = [
    { min: 1, max: 200, rate: -0.25 },
    { min: 201, max: 250, rate: -0.245 },
    { min: 251, max: 300, rate: -0.225 },
    { min: 301, max: 350, rate: -0.21 },
    { min: 351, max: 400, rate: -0.17 },
    { min: 401, max: 450, rate: -0.145 },
    { min: 451, max: 500, rate: -0.12 },
    { min: 501, max: 550, rate: -0.105 },
    { min: 551, max: 600, rate: -0.09 },
    { min: 601, max: 650, rate: -0.075 },
    { min: 651, max: 700, rate: -0.055 },
    { min: 701, max: 750, rate: -0.045 },
    { min: 751, max: 800, rate: -0.04 },
    { min: 801, max: 850, rate: -0.025 },
    { min: 851, max: 900, rate: -0.01 },
    { min: 901, max: 1000, rate: -0.005 }
];

function getIncentiveRate(usage) {
    for (const range of incentiveRates) {
        if (usage >= range.min && usage <= range.max) {
            return range.rate;
        }
    }
    return 0;
}

// Calculate TNB Bill using the real billing formula
function calculateTnbBill(usage, afaRate) {
    // Convert usage to numbers
    usage = parseFloat(usage);
    afaRate = parseFloat(afaRate);
    
    // Determine tariff rate based on usage
    const highUsage = usage > 1500;
    const energyRateSen = highUsage ? rates.domestic.energyHigh : rates.domestic.energy;
    const energyRateRM = energyRateSen / 100;
    
    // Calculate base and excess usage
    const baseUsage = Math.min(usage, 600);
    const excessUsage = Math.max(usage - 600, 0);
    
    // Calculate energy charges
    const baseEnergy = baseUsage * energyRateRM;
    const excessEnergy = excessUsage * energyRateRM;
    
    // Calculate other charges
    const capacityRateRM = rates.domestic.capacity / 100;
    const networkRateRM = rates.domestic.network / 100;
    
    const baseCapacity = baseUsage * capacityRateRM;
    const excessCapacity = excessUsage * capacityRateRM;
    
    const baseNetwork = baseUsage * networkRateRM;
    const excessNetwork = excessUsage * networkRateRM;
    
    // Calculate incentive (based on usage)
    const incentiveRate = getIncentiveRate(usage);
    const baseIncentive = baseUsage * incentiveRate;
    const excessIncentive = excessUsage * incentiveRate;
    const totalIncentive = baseIncentive + excessIncentive;
    
    // Retail charge (only for excess usage)
    const retailCharge = excessUsage > 0 ? rates.domestic.retail : 0;
    
    // AFA calculation - Only applies when usage > 600 kWh
    const afaRateRM = afaRate / 100;
    
    let baseAFA = 0;
    let excessAFA = 0;
    let totalAFA = 0;
    
    // AFA only applies when usage is more than 600 kWh
    if (usage > 600) {
        baseAFA = baseUsage * afaRateRM;
        excessAFA = excessUsage * afaRateRM;
        totalAFA = baseAFA + excessAFA;
    }

    // Current Monthly Usage Charge (before KWTBB and SST)
    const withoutServiceTax = baseEnergy + baseCapacity + baseNetwork + baseIncentive + baseAFA;
    const withServiceTax = excessEnergy + excessCapacity + excessNetwork + retailCharge + excessIncentive + excessAFA;
    const currentCharge = withoutServiceTax + withServiceTax;
    
    // KWTBB calculation (1.6% of specific components for usage > 300kWh)
    const kwtbbBase = (baseEnergy + excessEnergy) + 
                    (baseCapacity + excessCapacity) + 
                    (baseNetwork + excessNetwork) + 
                    (baseIncentive + excessIncentive);
    
    const kwtbb = usage > 300 ? Math.round(kwtbbBase * 0.016 * 100) / 100 : 0;
    
    // SST calculation (8% on just the "With Service Tax" portion)
    let sst = 0;
    if (excessUsage > 0) {
        sst = Math.round(withServiceTax * 0.08 * 100) / 100;
    }
    
    // Final total
    const grandTotal = currentCharge + kwtbb + sst;
    
    return {
        billAmount: grandTotal,
        // Detailed breakdown
        usageNonService: baseUsage,
        usageService: excessUsage,
        usageTotal: usage,
        energyNonService: baseEnergy,
        energyService: excessEnergy,
        energyTotal: baseEnergy + excessEnergy,
        afaNonService: baseAFA,
        afaService: excessAFA,
        afaTotal: totalAFA,
        capacityNonService: baseCapacity,
        capacityService: excessCapacity,
        capacityTotal: baseCapacity + excessCapacity,
        networkNonService: baseNetwork,
        networkService: excessNetwork,
        networkTotal: baseNetwork + excessNetwork,
        retailService: retailCharge,
        incentiveNonService: baseIncentive,
        incentiveService: excessIncentive,
        incentiveTotal: totalIncentive,
        usageChargeNonService: withoutServiceTax,
        usageChargeService: withServiceTax,
        usageChargeTotal: currentCharge,
        serviceTax: sst,
        kwtbb: kwtbb,
        totalBeforeSolar: grandTotal
    };
}

// Calculate After Solar Bill
function calculateAfterSolarBill(monthlyUsage, selfConsumptionKwh, afaRate) {
    // Calculate grid usage after solar self-consumption
    const gridUsageAfterSolar = Math.max(0, monthlyUsage - selfConsumptionKwh);
    
    // Calculate bill with solar (self-consumption reduces grid usage)
    return calculateTnbBill(gridUsageAfterSolar, afaRate);
}

// Calculate ATAP Savings
function calculateAtapSavings(monthlyUsage, monthlySolarGeneration, selfConsumptionPercent, smpRate, afaRate) {
    // Calculate self-consumption and export
    const selfConsumptionKwh = Math.min(monthlySolarGeneration, monthlySolarGeneration * (selfConsumptionPercent / 100));
    const batteryStorageKwh = parseFloat(document.getElementById('stored-solar').textContent) * 30;
    const exportedSolar = Math.max(0, monthlySolarGeneration - selfConsumptionKwh - batteryStorageKwh);
    
    // Calculate bill without solar
    const billWithoutSolar = calculateTnbBill(monthlyUsage, afaRate);
    
    // Calculate bill with solar (self-consumption reduces grid usage)
    const billWithSolar = calculateAfterSolarBill(monthlyUsage, selfConsumptionKwh, afaRate);
    
    // Calculate savings
    const directSavings = billWithoutSolar.billAmount - billWithSolar.billAmount;
    const batterySavings = batteryStorageKwh * RETAIL_TARIFF_LOW;
    const atapExportCredit = exportedSolar * smpRate;
    const totalSavings = directSavings + batterySavings + atapExportCredit;
    const finalBill = Math.max(0, billWithSolar.billAmount - atapExportCredit);
    const savingsPercentage = (totalSavings / billWithoutSolar.billAmount) * 100;
    
    return {
        billWithoutSolar: billWithoutSolar.billAmount,
        billWithSolar: billWithSolar.billAmount,
        finalBill: finalBill,
        monthlyUsage: monthlyUsage,
        monthlySolarGeneration: monthlySolarGeneration,
        selfConsumptionKwh: selfConsumptionKwh,
        selfConsumptionPercent: selfConsumptionPercent,
        batteryStorageKwh: batteryStorageKwh,
        exportedSolar: exportedSolar,
        directSavings: directSavings,
        batterySavings: batterySavings,
        atapExportCredit: atapExportCredit,
        totalSavings: totalSavings,
        savingsPercentage: savingsPercentage,
        billDetails: billWithoutSolar,
        afterSolarBillDetails: billWithSolar
    };
}

// Calculate ROI
function calculateROI() {
    const sellingPrice = parseFloat(document.getElementById('selling-price').value);
    const savingValue = parseFloat(document.getElementById('saving-value-total').textContent);
    
    // Calculate annual savings
    const annualSavings = savingValue * 12;
    
    // Calculate ROI in years
    const roiYears = sellingPrice / annualSavings;
    
    // Calculate ROI in months
    const roiMonths = roiYears * 12;
    
    // Update ROI table
    document.getElementById('roi-saving-value').textContent = savingValue.toFixed(2);
    document.getElementById('roi-saving-value-year').textContent = annualSavings.toFixed(2);
    document.getElementById('roi-years').textContent = roiYears.toFixed(2);
    document.getElementById('roi-months').textContent = roiMonths.toFixed(2);
}

// Calculate Energy Efficiency Incentive Unit Cost
function calculateIncentiveUnitCost(afterSolarBillDetails) {
    // Calculate the effective incentive rate per kWh
    if (afterSolarBillDetails.usageTotal > 0) {
        return afterSolarBillDetails.incentiveTotal / afterSolarBillDetails.usageTotal;
    }
    return 0;
}

// Initialize the page
document.addEventListener('DOMContentLoaded', function() {
    // Initialize adjustable slider for daytime split
    initializeAdjustableSlider('daytime-split-slider', updateDaytimeSplit);
    
    // Calculate initial TNB bill
    updateTnbBillComparison();
    updateDetailedBillBreakdown();
    
    // Set fixed target saving to 100%
    calculateTargetSaving();
    
    // Initialize ROI calculation
    calculateROI();
});

// Initialize adjustable slider with 10% increments
function initializeAdjustableSlider(sliderId, updateFunction) {
    const slider = document.getElementById(sliderId);
    
    slider.addEventListener('input', function() {
        updateFunction(parseInt(this.value));
    });
}

// Update daytime split
function updateDaytimeSplit(value) {
    document.getElementById('daytime-value').textContent = `${value}%`;
    document.getElementById('night-value').textContent = `${100 - value}%`;
    
    updateUsageSplit();
    calculateTargetSaving();
    updateEnergyFlow();
    updateTnbBillComparison();
    updateDetailedBillBreakdown();
    calculateROI();
}

// Toggle between kWh and Bill input
document.getElementById('toggle-kwh').addEventListener('click', function() {
    document.getElementById('toggle-kwh').classList.add('active');
    document.getElementById('toggle-bill').classList.remove('active');
    document.getElementById('kwh-input').style.display = 'flex';
    document.getElementById('bill-input').style.display = 'none';
});

document.getElementById('toggle-bill').addEventListener('click', function() {
    document.getElementById('toggle-bill').classList.add('active');
    document.getElementById('toggle-kwh').classList.remove('active');
    document.getElementById('bill-input').style.display = 'flex';
    document.getElementById('kwh-input').style.display = 'none';
});

// Convert bill to kWh and vice versa
document.getElementById('monthly-bill').addEventListener('input', function() {
    const monthlyBill = parseFloat(this.value);
    const tariffRate = getTariffRateFromBill(monthlyBill);
    const monthlyUsage = monthlyBill / tariffRate;
    
    document.getElementById('monthly-usage').value = Math.round(monthlyUsage);
    
    updateUsageSplit();
    updateTariffDisplay();
    calculateTargetSaving();
    updateEnergyFlow();
    updateTnbBillComparison();
    updateDetailedBillBreakdown();
    calculateROI();
});

document.getElementById('monthly-usage').addEventListener('input', function() {
    const monthlyUsage = parseFloat(this.value);
    const tariffRate = getTariffRate(monthlyUsage);
    const monthlyBill = monthlyUsage * tariffRate;
    
    document.getElementById('monthly-bill').value = monthlyBill.toFixed(2);
    
    updateUsageSplit();
    updateTariffDisplay();
    calculateTargetSaving();
    updateEnergyFlow();
    updateTnbBillComparison();
    updateDetailedBillBreakdown();
    calculateROI();
});

// Helper function to get tariff rate from bill amount
function getTariffRateFromBill(bill) {
    // Estimate which tariff tier based on bill amount
    // If bill <= 1500 * 0.443 = 664.5, assume low tariff
    return bill <= 664.5 ? RETAIL_TARIFF_LOW : RETAIL_TARIFF_HIGH;
}

// AFA rate input
document.getElementById('afa-rate').addEventListener('input', function() {
    updateTnbBillComparison();
    updateDetailedBillBreakdown();
    calculateROI();
});

// Peak Sun Hours input
document.getElementById('peak-sun-hours').addEventListener('input', function() {
    updateDailyGeneration();
    updateTnbBillComparison();
    updateDetailedBillBreakdown();
    calculateROI();
});

// Selling Price input
document.getElementById('selling-price').addEventListener('input', function() {
    calculateROI();
});

// New function to update TNB bill comparison
function updateTnbBillComparison() {
    const monthlyUsage = parseFloat(document.getElementById('monthly-usage').value);
    const dailyGeneration = parseFloat(document.getElementById('daily-generation').textContent);
    const monthlySolarGeneration = dailyGeneration * 30;
    
    // Calculate self-consumption percentage based on daytime usage
    const daytimeValue = document.getElementById('daytime-split-slider').value;
    const selfConsumptionPercent = parseInt(daytimeValue); // Simplified assumption
    
    // Get AFA rate
    const afaRate = parseFloat(document.getElementById('afa-rate').value);
    
    // Calculate ATAP savings
    const atapSavings = calculateAtapSavings(monthlyUsage, monthlySolarGeneration, selfConsumptionPercent, FIXED_SMP_RATE, afaRate);
}

// New function to update detailed bill breakdown
function updateDetailedBillBreakdown() {
    const monthlyUsage = parseFloat(document.getElementById('monthly-usage').value);
    const dailyGeneration = parseFloat(document.getElementById('daily-generation').textContent);
    const monthlySolarGeneration = dailyGeneration * 30;
    
    // Calculate self-consumption percentage based on daytime usage
    const daytimeValue = document.getElementById('daytime-split-slider').value;
    const selfConsumptionPercent = parseInt(daytimeValue);
    
    // Get AFA rate
    const afaRate = parseFloat(document.getElementById('afa-rate').value);
    
    // Get retail tariff rate
    const retailTariff = getTariffRate(monthlyUsage);
    
    // Calculate ATAP savings
    const atapSavings = calculateAtapSavings(monthlyUsage, monthlySolarGeneration, selfConsumptionPercent, FIXED_SMP_RATE, afaRate);
    
    // Update TNB Bill Breakdown table (Before Solar)
    const billDetails = atapSavings.billDetails;
    
    document.getElementById('usage-non-service').textContent = billDetails.usageNonService.toFixed(2);
    document.getElementById('usage-service').textContent = billDetails.usageService.toFixed(2);
    document.getElementById('usage-total').textContent = billDetails.usageTotal.toFixed(2);
    
    document.getElementById('energy-non-service').textContent = billDetails.energyNonService.toFixed(2);
    document.getElementById('energy-service').textContent = billDetails.energyService.toFixed(2);
    document.getElementById('energy-total').textContent = billDetails.energyTotal.toFixed(2);
    
    document.getElementById('afa-non-service').textContent = billDetails.afaNonService.toFixed(2);
    document.getElementById('afa-service').textContent = billDetails.afaService.toFixed(2);
    document.getElementById('afa-total').textContent = billDetails.afaTotal.toFixed(2);
    
    document.getElementById('capacity-non-service').textContent = billDetails.capacityNonService.toFixed(2);
    document.getElementById('capacity-service').textContent = billDetails.capacityService.toFixed(2);
    document.getElementById('capacity-total').textContent = billDetails.capacityTotal.toFixed(2);
    
    document.getElementById('network-non-service').textContent = billDetails.networkNonService.toFixed(2);
    document.getElementById('network-service').textContent = billDetails.networkService.toFixed(2);
    document.getElementById('network-total').textContent = billDetails.networkTotal.toFixed(2);
    
    document.getElementById('retail-service').textContent = billDetails.retailService.toFixed(2);
    document.getElementById('retail-total').textContent = billDetails.retailService.toFixed(2);
    
    document.getElementById('incentive-non-service').textContent = billDetails.incentiveNonService.toFixed(2);
    document.getElementById('incentive-service').textContent = billDetails.incentiveService.toFixed(2);
    document.getElementById('incentive-total').textContent = billDetails.incentiveTotal.toFixed(2);
    
    document.getElementById('usage-charge-non-service').textContent = billDetails.usageChargeNonService.toFixed(2);
    document.getElementById('usage-charge-service').textContent = billDetails.usageChargeService.toFixed(2);
    document.getElementById('usage-charge-total').textContent = billDetails.usageChargeTotal.toFixed(2);
    
    document.getElementById('service-tax').textContent = billDetails.serviceTax.toFixed(2);
    document.getElementById('kwtbb').textContent = billDetails.kwtbb.toFixed(2);
    document.getElementById('total-before-solar').textContent = billDetails.totalBeforeSolar.toFixed(2);
    
    // Calculate After Solar based on Daytime Usage Split slider
    const daytimeUsagePercent = parseInt(daytimeValue) / 100; // Convert percentage to decimal
    const afterSolarUsage = monthlyUsage * (1 - daytimeUsagePercent); // Only night usage remains
    const afterSolarBillDetails = calculateTnbBill(afterSolarUsage, afaRate);
    
    document.getElementById('after-usage-non-service').textContent = afterSolarBillDetails.usageNonService.toFixed(2);
    document.getElementById('after-usage-service').textContent = afterSolarBillDetails.usageService.toFixed(2);
    document.getElementById('after-usage-total').textContent = afterSolarBillDetails.usageTotal.toFixed(2);
    
    document.getElementById('after-energy-non-service').textContent = afterSolarBillDetails.energyNonService.toFixed(2);
    document.getElementById('after-energy-service').textContent = afterSolarBillDetails.energyService.toFixed(2);
    document.getElementById('after-energy-total').textContent = afterSolarBillDetails.energyTotal.toFixed(2);
    
    document.getElementById('after-afa-non-service').textContent = afterSolarBillDetails.afaNonService.toFixed(2);
    document.getElementById('after-afa-service').textContent = afterSolarBillDetails.afaService.toFixed(2);
    document.getElementById('after-afa-total').textContent = afterSolarBillDetails.afaTotal.toFixed(2);
    
    document.getElementById('after-capacity-non-service').textContent = afterSolarBillDetails.capacityNonService.toFixed(2);
    document.getElementById('after-capacity-service').textContent = afterSolarBillDetails.capacityService.toFixed(2);
    document.getElementById('after-capacity-total').textContent = afterSolarBillDetails.capacityTotal.toFixed(2);
    
    document.getElementById('after-network-non-service').textContent = afterSolarBillDetails.networkNonService.toFixed(2);
    document.getElementById('after-network-service').textContent = afterSolarBillDetails.networkService.toFixed(2);
    document.getElementById('after-network-total').textContent = afterSolarBillDetails.networkTotal.toFixed(2);
    
    document.getElementById('after-retail-service').textContent = afterSolarBillDetails.retailService.toFixed(2);
    document.getElementById('after-retail-total').textContent = afterSolarBillDetails.retailService.toFixed(2);
    
    document.getElementById('after-incentive-non-service').textContent = afterSolarBillDetails.incentiveNonService.toFixed(2);
    document.getElementById('after-incentive-service').textContent = afterSolarBillDetails.incentiveService.toFixed(2);
    document.getElementById('after-incentive-total').textContent = afterSolarBillDetails.incentiveTotal.toFixed(2);
    
    document.getElementById('after-usage-charge-non-service').textContent = afterSolarBillDetails.usageChargeNonService.toFixed(2);
    document.getElementById('after-usage-charge-service').textContent = afterSolarBillDetails.usageChargeService.toFixed(2);
    document.getElementById('after-usage-charge-total').textContent = afterSolarBillDetails.usageChargeTotal.toFixed(2);
    
    document.getElementById('after-service-tax').textContent = afterSolarBillDetails.serviceTax.toFixed(2);
    document.getElementById('after-kwtbb').textContent = afterSolarBillDetails.kwtbb.toFixed(2);
    document.getElementById('total-after-solar').textContent = afterSolarBillDetails.totalBeforeSolar.toFixed(2);
    
    // Calculate Saving Value table
    // Total kWh = Solar generation - (TNB usage * Day Usage %)
    const savingValueKwh = monthlySolarGeneration - (monthlyUsage * daytimeUsagePercent);
    
    // Get stored BESS kWh (monthly)
    const batteryStorageKwh = parseFloat(document.getElementById('stored-solar').textContent) * 30;
    
    // Determine tariff rate for stored BESS based on batteryStorageKwh
    const bessTariffRate = batteryStorageKwh <= 1500 ? RETAIL_TARIFF_LOW : RETAIL_TARIFF_HIGH;
    
    // Calculate stored in BESS value = (kWh stored) × Unit cost (based on stored kWh)
    const storedBessValue = batteryStorageKwh * bessTariffRate;
    
    // Calculate exported to grid = (remaining energy after BESS) × SMP rate
    const exportedKwh = Math.max(0, savingValueKwh - batteryStorageKwh);
    const exportedValue = exportedKwh * FIXED_SMP_RATE;
    
    // Calculate Energy Efficiency Incentive based on exported kWh and unit cost
    const incentiveUnitCost = calculateIncentiveUnitCost(afterSolarBillDetails);
    const incentiveValue = exportedKwh * incentiveUnitCost;
    
    // Generation Value = Stored in BESS + Exported to Grid + Energy Efficiency Incentive
    const generationValue = storedBessValue + exportedValue + incentiveValue;
    
    // Bill Amount = (After Solar Bill Amount) - (Generation Value)
    const savingBillAmount = Math.max(0, afterSolarBillDetails.totalBeforeSolar - generationValue);
    
    // Saving Value = (Before Solar Bill Amount) - (Saving Value Bill Amount)
    const savingValueTotal = billDetails.totalBeforeSolar - savingBillAmount;
    
    // Update Saving Value table
    document.getElementById('saving-total-kwh').textContent = savingValueKwh.toFixed(2);
    document.getElementById('saving-stored-kwh').textContent = batteryStorageKwh.toFixed(2);
    document.getElementById('saving-stored-unit-cost').textContent = bessTariffRate.toFixed(4);
    document.getElementById('saving-stored-value').textContent = storedBessValue.toFixed(2);
    
    document.getElementById('saving-export-kwh').textContent = exportedKwh.toFixed(2);
    document.getElementById('saving-export-unit-cost').textContent = FIXED_SMP_RATE.toFixed(2);
    document.getElementById('saving-export-value').textContent = exportedValue.toFixed(2);
    
    document.getElementById('saving-incentive-kwh').textContent = exportedKwh.toFixed(2);
    document.getElementById('saving-incentive-unit-cost').textContent = incentiveUnitCost.toFixed(4);
    document.getElementById('saving-incentive-value').textContent = incentiveValue.toFixed(2);
    
    document.getElementById('saving-generation-value').textContent = generationValue.toFixed(2);
    document.getElementById('saving-bill-amount').textContent = savingBillAmount.toFixed(2);
    document.getElementById('saving-value-total').textContent = savingValueTotal.toFixed(2);
    
    // Update Generation Value Without BESS table
    document.getElementById('gen-total-kwh').textContent = monthlySolarGeneration.toFixed(2);
    
    // Direct consumption = (TNB usage * Day Usage %)
    const genDirectKwh = monthlyUsage * daytimeUsagePercent;
    
    // Determine tariff rate for direct consumption based on genDirectKwh
    const directConsumptionTariffRate = genDirectKwh <= 1500 ? RETAIL_TARIFF_LOW : RETAIL_TARIFF_HIGH;
    const genDirectValue = genDirectKwh * directConsumptionTariffRate;
    
    document.getElementById('gen-direct-kwh').textContent = genDirectKwh.toFixed(2);
    document.getElementById('gen-direct-unit-cost').textContent = directConsumptionTariffRate.toFixed(4);
    document.getElementById('gen-direct-value').textContent = genDirectValue.toFixed(2);
    
    // Exported to grid = Total generation - Direct consumption
    const genExportKwh = monthlySolarGeneration - genDirectKwh;
    const genExportValue = genExportKwh * FIXED_SMP_RATE;
    
    document.getElementById('gen-export-kwh').textContent = genExportKwh.toFixed(2);
    document.getElementById('gen-export-unit-cost').textContent = FIXED_SMP_RATE.toFixed(2);
    document.getElementById('gen-export-value').textContent = genExportValue.toFixed(2);
    
    // Total generation value
    const genTotalValue = genDirectValue + genExportValue;
    document.getElementById('gen-total-value').textContent = genTotalValue.toFixed(2);
    
    // Update ATAP Solar Savings Calculation table
    document.getElementById('solar-generation-total').textContent = `${atapSavings.monthlySolarGeneration.toFixed(2)} kWh`;
    document.getElementById('self-consumption-kwh').textContent = `${atapSavings.selfConsumptionKwh.toFixed(2)} kWh (${selfConsumptionPercent}%)`;
    document.getElementById('battery-storage-kwh').textContent = `${atapSavings.batteryStorageKwh.toFixed(2)} kWh`;
    document.getElementById('exported-solar').textContent = `${atapSavings.exportedSolar.toFixed(2)} kWh`;
    
    document.getElementById('direct-savings').textContent = `RM ${atapSavings.directSavings.toFixed(2)}`;
    document.getElementById('battery-savings').textContent = `RM ${atapSavings.batterySavings.toFixed(2)}`;
    document.getElementById('atap-export-credit').textContent = `RM ${atapSavings.atapExportCredit.toFixed(2)}`;
    document.getElementById('total-savings').textContent = `RM ${atapSavings.totalSavings.toFixed(2)}`;
    
    // Update Savings Summary
    document.getElementById('original-bill').textContent = `RM ${atapSavings.billWithoutSolar.toFixed(2)}`;
    document.getElementById('total-savings-summary').textContent = `RM ${atapSavings.totalSavings.toFixed(2)}`;
    document.getElementById('final-bill').textContent = `RM ${atapSavings.finalBill.toFixed(2)}`;
    document.getElementById('savings-percentage').textContent = `Total Savings Percentage: ${atapSavings.savingsPercentage.toFixed(1)}%`;
    
    // Update calculation formulas with actual values
    updateCalculationFormulas(atapSavings, retailTariff, FIXED_SMP_RATE);
    
    // Update ROI calculation
    calculateROI();
}

// New function to update calculation formulas with actual values
function updateCalculationFormulas(atapSavings, retailTariff, smpRate) {
    const dailyGeneration = parseFloat(document.getElementById('daily-generation').textContent);
    const daytimeValue = document.getElementById('daytime-split-slider').value;
    const selfConsumptionPercent = parseInt(daytimeValue);
    const storedSolar = parseFloat(document.getElementById('stored-solar').textContent);
    const systemCapacity = parseFloat(document.getElementById('system-capacity').textContent);
    const peakSunHours = parseFloat(document.getElementById('peak-sun-hours').value);
    
    // Update Solar Generation formula
    const solarGenFormulas = document.querySelectorAll('.savings-breakdown .calculation-formula');
    if (solarGenFormulas.length > 0) {
        solarGenFormulas[0].innerHTML = `Formula: <span class="formula-highlight">System Capacity × Peak Sun Hours × 30 days</span><br>
                                Actual: ${systemCapacity} kWp × ${peakSunHours} hours × 30 = ${atapSavings.monthlySolarGeneration.toFixed(2)} kWh`;
        
        // Update Self-Consumption formula
        solarGenFormulas[1].innerHTML = `Formula: <span class="formula-highlight">Total Generation × Self-Consumption %</span><br>
                                      Actual: ${atapSavings.monthlySolarGeneration.toFixed(2)} kWh × ${selfConsumptionPercent}% = ${atapSavings.selfConsumptionKwh.toFixed(2)} kWh`;
        
        // Update Battery Storage formula
        solarGenFormulas[2].innerHTML = `Formula: <span class="formula-highlight">Stored Solar × 30 days</span><br>
                                   Actual: ${storedSolar} kWh/day × 30 = ${atapSavings.batteryStorageKwh.toFixed(2)} kWh`;
        
        // Update Export formula
        solarGenFormulas[3].innerHTML = `Formula: <span class="formula-highlight">Total Generation - Self-Consumption - Battery Storage</span><br>
                              Actual: ${atapSavings.monthlySolarGeneration.toFixed(2)} kWh - ${atapSavings.selfConsumptionKwh.toFixed(2)} kWh - ${atapSavings.batteryStorageKwh.toFixed(2)} kWh = ${atapSavings.exportedSolar.toFixed(2)} kWh`;
        
        // Update Direct Savings formula
        solarGenFormulas[4].innerHTML = `Formula: <span class="formula-highlight">Self-Consumption × Retail Tariff Rate</span><br>
                                    Actual: ${atapSavings.selfConsumptionKwh.toFixed(2)} kWh × RM ${retailTariff.toFixed(3)}/kWh = RM ${atapSavings.directSavings.toFixed(2)}`;
        
        // Update Battery Savings formula
        solarGenFormulas[5].innerHTML = `Formula: <span class="formula-highlight">Battery Storage × Retail Tariff Rate</span><br>
                                   Actual: ${atapSavings.batteryStorageKwh.toFixed(2)} kWh × RM ${retailTariff.toFixed(3)}/kWh = RM ${atapSavings.batterySavings.toFixed(2)}`;
        
        // Update Export Credit formula
        solarGenFormulas[6].innerHTML = `Formula: <span class="formula-highlight">Exported Solar × SMP Rate</span><br>
                                   Actual: ${atapSavings.exportedSolar.toFixed(2)} kWh × RM ${smpRate.toFixed(3)}/kWh = RM ${atapSavings.atapExportCredit.toFixed(2)}`;
        
        // Update Total Savings formula
        solarGenFormulas[7].innerHTML = `Formula: <span class="formula-highlight">Direct Savings + Battery Savings + Export Credit</span><br>
                                   Actual: RM ${atapSavings.directSavings.toFixed(2)} + RM ${atapSavings.batterySavings.toFixed(2)} + RM ${atapSavings.atapExportCredit.toFixed(2)} = RM ${atapSavings.totalSavings.toFixed(2)}`;
    }
}

function updateTariffDisplay() {
    const monthlyUsage = parseFloat(document.getElementById('monthly-usage').value) || 0;
    const tariffRate = getTariffRate(monthlyUsage);
    document.getElementById('current-tariff').textContent = `RM ${tariffRate.toFixed(4)}/kWh`;
}

function updateSmpTooltips() {
    // Fixed SMP rate at 0.20
    document.getElementById('smp-tooltip').title = `Exported at SMP rate (RM${FIXED_SMP_RATE.toFixed(3)}/kWh)`;
}

function getTariffRate(monthlyUsage) {
    return monthlyUsage > 1500 ? RETAIL_TARIFF_HIGH : RETAIL_TARIFF_LOW;
}

function updateUsageSplit() {
    const monthlyUsage = parseFloat(document.getElementById('monthly-usage').value);
    const daytimeValue = document.getElementById('daytime-split-slider').value;
    const daytimeSplit = parseInt(daytimeValue);
    const nightSplit = 100 - daytimeSplit;
    
    const dailyUsage = monthlyUsage / 30;
    const daytimeUsage = (dailyUsage * daytimeSplit / 100).toFixed(2);
    const nightUsage = (dailyUsage * nightSplit / 100).toFixed(2);
    
    const daytimeMonthly = (monthlyUsage * daytimeSplit / 100).toFixed(2);
    const nightMonthly = (monthlyUsage * nightSplit / 100).toFixed(2);
    
    document.getElementById('daytime-usage').textContent = `${daytimeUsage} kWh/day`;
    document.getElementById('night-usage').textContent = `${nightUsage} kWh/day`;
    document.getElementById('daytime-monthly').textContent = `${daytimeMonthly} kWh/month`;
    document.getElementById('night-monthly').textContent = `${nightMonthly} kWh/month`;
    
    updateNightCoverage();
}

function calculateTargetSaving() {
    const monthlyUsage = parseFloat(document.getElementById('monthly-usage').value);
    
    // Calculate required panels based on fixed target saving of 100% (max 38 panels)
    // Base calculation: 1 panel per 50 kWh monthly usage for 80% savings
    const basePanels = Math.ceil(monthlyUsage / 50);
    const adjustedPanels = Math.min(Math.ceil(basePanels * (FIXED_TARGET_SAVING / 80)), 38);
    
    // Calculate required battery units based on target saving and night usage
    const nightUsage = parseFloat(document.getElementById('night-usage').textContent);
    const baseBatteryUnits = Math.ceil(nightUsage / 7); // 7 kWh per battery unit
    const adjustedBatteryUnits = Math.ceil(baseBatteryUnits * (FIXED_TARGET_SAVING / 80));
    
    // Update Solar System to match
    document.getElementById('panel-count').value = adjustedPanels;
    document.getElementById('battery-units-nem').value = adjustedBatteryUnits;
    
    // Update calculations
    updateSystemCapacity();
    updateBatteryCapacity();
    
    // Calculate monthly savings
    updateTnbBillComparison();
    updateDetailedBillBreakdown();
    calculateROI();
}

// Solar System Calculations
document.getElementById('panel-wattage').addEventListener('input', updateSystemCapacity);
document.getElementById('panel-count').addEventListener('input', function() {
    updateSystemCapacity();
    
    // When panel count is manually changed, recalculate everything
    updateEnergyFlow();
    updateTnbBillComparison();
    updateDetailedBillBreakdown();
    calculateROI();
});

document.getElementById('battery-kwh').addEventListener('change', updateBatteryCapacity);
document.getElementById('battery-units-nem').addEventListener('input', function() {
    updateBatteryCapacity();
    
    // When battery units are manually changed, recalculate everything
    updateEnergyFlow();
    updateTnbBillComparison();
    updateDetailedBillBreakdown();
    calculateROI();
});
document.getElementById('discharge-depth').addEventListener('input', updateBatteryCapacity);

// Battery kWh selection
document.getElementById('battery-kwh').addEventListener('change', function() {
    const selectedValue = this.value;
    const customBatteryDiv = document.getElementById('custom-battery');
    
    if (selectedValue === 'custom') {
        customBatteryDiv.classList.add('active');
    } else {
        customBatteryDiv.classList.remove('active');
        updateBatteryCapacity();
    }
});

// Custom battery input
document.getElementById('custom-battery-input').addEventListener('input', function() {
    updateBatteryCapacity();
});

function updateSystemCapacity() {
    const panelWattage = parseFloat(document.getElementById('panel-wattage').value);
    const panelCount = parseFloat(document.getElementById('panel-count').value);
    
    const systemCapacity = (panelWattage * panelCount / 1000).toFixed(2);
    document.getElementById('system-capacity').textContent = `${systemCapacity} kWp`;
    
    updateDailyGeneration();
}

function updateDailyGeneration() {
    const systemCapacity = parseFloat(document.getElementById('system-capacity').textContent);
    const peakSunHours = parseFloat(document.getElementById('peak-sun-hours').value);
    
    const dailyGeneration = (systemCapacity * peakSunHours).toFixed(2);
    const monthlyGeneration = (dailyGeneration * 30).toFixed(2);
    
    document.getElementById('daily-generation').textContent = `${dailyGeneration} kWh/day`;
    document.getElementById('monthly-generation').textContent = `${monthlyGeneration} kWh/month`;
    
    updateEnergyFlow();
    updateTnbBillComparison();
    updateDetailedBillBreakdown();
    calculateROI();
}

function updateBatteryCapacity() {
    const batteryKwh = document.getElementById('battery-kwh').value;
    let batteryCapacityPerUnit;
    
    if (batteryKwh === 'custom') {
        batteryCapacityPerUnit = parseFloat(document.getElementById('custom-battery-input').value) || 0;
    } else {
        batteryCapacityPerUnit = parseFloat(batteryKwh);
    }
    
    const batteryUnits = parseFloat(document.getElementById('battery-units-nem').value);
    const dischargeDepth = parseFloat(document.getElementById('discharge-depth').value);
    
    const totalCapacity = (batteryCapacityPerUnit * batteryUnits).toFixed(2);
    const usableCapacity = (totalCapacity * dischargeDepth / 100).toFixed(2);
    
    document.getElementById('total-capacity').textContent = `${totalCapacity} kWh`;
    document.getElementById('usable-capacity').textContent = `${usableCapacity} kWh`;
    
    updateNightCoverage();
}

function updateNightCoverage() {
    const nightUsage = parseFloat(document.getElementById('night-usage').textContent);
    const usableCapacity = parseFloat(document.getElementById('usable-capacity').textContent);
    
    const nightCoverage = Math.min((usableCapacity / nightUsage) * 100, 100).toFixed(1);
    document.getElementById('night-coverage').textContent = `${nightCoverage}%`;
    
    const storedSolar = Math.min(usableCapacity, nightUsage).toFixed(2);
    document.getElementById('stored-solar').textContent = `${storedSolar} kWh/day`;
    
    updateEnergyFlow();
}

function updateEnergyFlow() {
    const dailyGeneration = parseFloat(document.getElementById('daily-generation').textContent);
    const storedSolar = parseFloat(document.getElementById('stored-solar').textContent);
    const daytimeUsage = parseFloat(document.getElementById('daytime-usage').textContent);
    const nightUsage = parseFloat(document.getElementById('night-usage').textContent);
    
    // Calculate actual energy distribution
    const selfUse = Math.min(daytimeUsage, dailyGeneration * 0.3);
    let remainingEnergy = dailyGeneration - selfUse;
    
    const batteryStorage = Math.min(remainingEnergy, storedSolar);
    const exportEnergy = remainingEnergy - batteryStorage;
    
    updateTnbBillComparison();
}

// Initialize calculations
updateUsageSplit();
updateTariffDisplay();
updateSmpTooltips();
updateSystemCapacity();
updateBatteryCapacity();
calculateTargetSaving();
updateEnergyFlow();
updateTnbBillComparison();
updateDetailedBillBreakdown();
calculateROI();
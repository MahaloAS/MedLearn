import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import './App.css'
import { gadSimulationDataset } from './data/gadSimulationDataset'

const initialPatientState = {
  day: 0,
  anxietySeverity: 78,
  sideEffectBurden: 18,
  sedationLevel: 4,
  cognitiveImpact: 8,
  dependencyRisk: 0,
}

const frequencyOptions = [
  { key: 'onceDailyMorning', label: 'Morning only', hint: 'Simple routine with daytime consistency.' },
  { key: 'onceDailyNight', label: 'Night only', hint: 'May support sleep but can miss daytime control.' },
  { key: 'twiceDaily', label: 'Twice daily', hint: 'More steady exposure for some agents.' },
  { key: 'threeTimesDaily', label: 'Three times daily', hint: 'Higher effort and more chance of error.' },
]

const therapyProfiles = {
  cbt: { gain: 4.8, burdenReduction: 0.6 },
  act: { gain: 3.8, burdenReduction: 0.5 },
  lifestyle: { gain: 3.2, burdenReduction: 0.8 },
  mbsr: { gain: 3.4, burdenReduction: 0.5 },
}

const pharmacologyDefinitions = [
  {
    id: 'ssri',
    title: 'SSRI',
    short: 'Selective serotonin reuptake inhibitor',
    summary: 'SSRIs raise serotonin availability in the synaptic cleft, gradually improving emotional regulation and reducing excessive worry.',
    highlights: ['Targets the serotonin transporter', 'Often preferred for steady, long-term anxiety control', 'May take 2-4 weeks to reach full effect'],
  },
  {
    id: 'snri',
    title: 'SNRI',
    short: 'Serotonin-norepinephrine reuptake inhibitor',
    summary: 'SNRIs increase both serotonin and norepinephrine, which can help anxiety but may also increase activation, heart rate, and blood pressure.',
    highlights: ['Affects both serotonin and norepinephrine', 'Can be useful when anxiety is paired with low energy or pain', 'Often requires more careful titration'],
  },
  {
    id: 'benzodiazepine',
    title: 'Benzodiazepine',
    short: 'GABA-A potentiator',
    summary: 'These agents rapidly enhance inhibitory signaling, which can quickly calm acute anxiety but also raise sedation and dependence risk.',
    highlights: ['Fast-acting but less selective', 'Higher risk of sedation and dependence', 'Best reserved for short-term or situational use'],
  },
  {
    id: 'azapirone',
    title: 'Azapirone',
    short: '5-HT1A partial agonist',
    summary: 'Azapirones offer a gentler anxiolytic effect with less sedation, though they often require consistency and longer use to feel helpful.',
    highlights: ['Less sedating than benzodiazepines', 'Works more gradually', 'Can be useful for chronic, low-grade anxiety'],
  },
]

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function getDoseZone(medication, dose) {
  const typicalMin = medication?.dosing?.typicalDoseRange?.min
  const typicalMax = medication?.dosing?.typicalDoseRange?.max
  const min = Number.isFinite(Number(typicalMin)) ? Number(typicalMin) : 0
  const max = Number.isFinite(Number(typicalMax)) ? Number(typicalMax) : 0

  const elevatedCeiling = max * 1.5
  if (dose < min) return 'subtherapeutic'
  if (dose <= max) return 'therapeutic'
  if (dose <= elevatedCeiling) return 'high-risk'
  return 'extreme'
}


function getTypicalMax(medication) {
  const fromTypical = medication?.dosing?.typicalDoseRange?.max
  if (Number.isFinite(fromTypical)) return Number(fromTypical)
  const fromMax = medication?.dosing?.maximumDose
  if (Number.isFinite(fromMax)) return Number(fromMax)
  // Fallback: attempt to find any max-like numeric field
  const fallback = medication?.dosing?.typicalDoseRange?.max
  return Number.isFinite(fallback) ? Number(fallback) : 100
}

function getExtremeCap(medication) {
  const typicalMax = getTypicalMax(medication)
  return Math.round(typicalMax * 2.5)
}


function getDoseModifier(medication, dose) {
  const zone = getDoseZone(medication, dose)
  if (zone === 'subtherapeutic') return 0.55
  if (zone === 'therapeutic') return 1
  if (zone === 'high-risk') return 1.05
  return 0.8
}

function getFrequencyModifier(optionKey) {
  switch (optionKey) {
    case 'onceDailyMorning':
      return 1
    case 'onceDailyNight':
      return 0.95
    case 'twiceDaily':
      return 1.06
    case 'threeTimesDaily':
      return 1.03
    default:
      return 1
  }
}

function getFrequencyHint(optionKey) {
  return frequencyOptions.find((option) => option.key === optionKey)?.hint ?? 'Plan should be consistent.'
}

function simulateStep(currentState, medicationPlans, treatmentIds, executionQuality) {
  const executionFactor = clamp(executionQuality / 100, 0.35, 1)
  const selectedMedications = medicationPlans.filter(Boolean)
  const medicationCount = selectedMedications.length

  let anxietyDelta = 0
  let sideEffectDelta = 0
  let sedationDelta = 0
  let cognitiveDelta = 0
  let dependencyDelta = 0

const sideEffectMultiplierByZone = {
    subtherapeutic: 0.7,
    therapeutic: 1.1,
    'high-risk': 1.7,
    extreme: 2.6,
  }

  selectedMedications.forEach((medication) => {
    const dose = medication.dose
    const frequencyKey = medication.frequency
    const frequencyModifier = getFrequencyModifier(frequencyKey)
    const doseModifier = getDoseModifier(medication.medication, dose)
    const zone = getDoseZone(medication.medication, dose)
    const onsetFactor = currentState.day >= medication.medication.pharmacology.onsetDays ? 1 : currentState.day / medication.medication.pharmacology.onsetDays
    const baseContribution = medication.medication.efficacy.responseProbability * 10 * doseModifier * frequencyModifier * executionFactor * onsetFactor

    anxietyDelta -= baseContribution * (medicationCount > 1 ? 0.95 : 1)

    const sideEffectLoad = sideEffectMultiplierByZone[zone] * (dose / medication.medication.dosing.typicalDoseRange.max) * 1.8
    sideEffectDelta += sideEffectLoad * (medicationCount > 1 ? 1.12 : 1)

    if (medication.medication.drugClass === 'Benzodiazepine') {
      sedationDelta += 2.2 * doseModifier
      dependencyDelta += 0.6
    }
    if (medication.medication.drugClass === 'SSRI') {
      cognitiveDelta += 0.4
    }
    if (medication.medication.drugClass === 'SNRI') {
      sedationDelta += 0.8
      cognitiveDelta += 0.3
    }
    if (medication.medication.drugClass === 'Azapirone') {
      cognitiveDelta += 0.2
    }

    if (zone === 'extreme') {
      sedationDelta += 1.6
      cognitiveDelta += 1.3
      if (medication.medication.drugClass === 'Benzodiazepine') {
        dependencyDelta += 1.2
      }
    }
  })

  treatmentIds.forEach((treatmentId) => {
    const profile = therapyProfiles[treatmentId]
    if (!profile) return
    anxietyDelta -= profile.gain * (executionFactor * 0.95)
    sideEffectDelta -= profile.burdenReduction * 0.4
  })

  if (selectedMedications.length === 0) {
    anxietyDelta -= 1.8
  }

  const nextAnxiety = clamp(currentState.anxietySeverity + anxietyDelta + (selectedMedications.length > 1 ? 1.4 : 0), 0, 100)
  const nextSideEffects = clamp(currentState.sideEffectBurden + sideEffectDelta + (executionFactor < 0.7 ? 3 : 0), 0, 100)
  const nextSedation = clamp(currentState.sedationLevel + sedationDelta - (treatmentIds.includes('lifestyle') ? 0.5 : 0), 0, 100)
  const nextCognitive = clamp(currentState.cognitiveImpact + cognitiveDelta - (treatmentIds.includes('mbsr') ? 0.3 : 0), 0, 100)
  const nextDependency = clamp(currentState.dependencyRisk + dependencyDelta + (executionFactor < 0.6 ? 0.8 : 0), 0, 100)

  return {
    day: currentState.day + 7,
    anxietySeverity: Math.round(nextAnxiety),
    sideEffectBurden: Math.round(nextSideEffects),
    sedationLevel: Math.round(nextSedation),
    cognitiveImpact: Math.round(nextCognitive),
    dependencyRisk: Math.round(nextDependency),
  }
}

function LineChart({ data, dataKey, color, max }) {
  const width = 300
  const height = 160
  const padding = 20
  const points = data.map((point, index) => {
    const x = padding + (index / Math.max(data.length - 1, 1)) * (width - padding * 2)
    const y = height - padding - (point[dataKey] / max) * (height - padding * 2)
    return `${x},${y}`
  })

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="line-chart" role="img" aria-label={`${dataKey} trend`}>
      <line x1={padding} x2={width - padding} y1={height - padding} y2={height - padding} className="chart-axis" />
      <line x1={padding} x2={padding} y1={padding} y2={height - padding} className="chart-axis" />
      <polyline fill="none" stroke={color} strokeWidth="3" points={points.join(' ')} />
    </svg>
  )
}

function BrainMapCard({ medication, selectedCount, neuroView, onSelectMedication }) {
  if (!medication) return null

  const isBrainView = neuroView === 'brain'

  return (
    <div className="mechanism-card">
      <div className="mechanism-card-head">
        <div>
          <h4>{medication.genericName}</h4>
          <p>{medication.drugClass} • {selectedCount > 1 ? 'active comparison' : 'mechanism spotlight'}</p>
        </div>
        <button className="pill small" onClick={() => onSelectMedication?.(medication.id)}>
          Focus
        </button>
      </div>

      <p className="mechanism-summary">{isBrainView ? medication.neurobiology.summary : `The main body impact is on ${medication.neurobiology.bodySystems.join(', ')}.`}</p>

      <p className="mechanism-paragraph">
        {isBrainView
          ? `${medication.genericName} acts mainly in ${medication.neurobiology.brainRegions.join(' and ')} by shifting signaling in key limbic and cortical circuits. ${medication.neurobiology.summary}`
          : `${medication.genericName} influences ${medication.neurobiology.bodySystems.join(', ')} through its receptor and transporter effects, which helps explain both its therapeutic benefit and its possible side effects.`}
      </p>
    </div>
  )
}

function App() {
  const [selectedMedicationIds, setSelectedMedicationIds] = useState(['sertraline'])
  const [doseByMedication, setDoseByMedication] = useState({ sertraline: 50 })
  const [frequencyByMedication, setFrequencyByMedication] = useState({ sertraline: 'onceDailyMorning' })
  const [selectedTreatments, setSelectedTreatments] = useState(['cbt'])
  const [executionQuality, setExecutionQuality] = useState(84)
  const [timeline, setTimeline] = useState([initialPatientState])
  const [isRunning, setIsRunning] = useState(false)
  const [activeDefinitionId, setActiveDefinitionId] = useState('ssri')
  const [neuroView, setNeuroView] = useState('brain')
  const [activeMechanismId, setActiveMechanismId] = useState('sertraline')
  const [isDarkMode, setIsDarkMode] = useState(false)
  const [stage, setStage] = useState('selection')

  useEffect(() => {
    document.documentElement.classList.remove('theme-light', 'theme-dark')
    document.documentElement.classList.add(isDarkMode ? 'theme-dark' : 'theme-light')
  }, [isDarkMode])

  const currentPoint = timeline[timeline.length - 1] ?? initialPatientState
  const selectedMedications = useMemo(
    () =>
      selectedMedicationIds
        .map((id) => {
          const medication = gadSimulationDataset.medications.find((item) => item.id === id)
          if (!medication) return null
          return {
            id,
            medication,
            dose: doseByMedication[id] ?? medication.dosing.initialDose,
            frequency: frequencyByMedication[id] ?? medication.dosing.defaultFrequency,
          }
        })
        .filter(Boolean),
    [doseByMedication, frequencyByMedication, selectedMedicationIds],
  )

  const therapyItems = useMemo(
    () => gadSimulationDataset.nonPharmacologicTreatments.filter((item) => selectedTreatments.includes(item.id)),
    [selectedTreatments],
  )

  const spotlightMedication = useMemo(() => {
    const selected = selectedMedications.find((entry) => entry.id === activeMechanismId) ?? selectedMedications[0]
    return selected?.medication ?? null
  }, [activeMechanismId, selectedMedications])
  const activeDefinition = useMemo(
    () => pharmacologyDefinitions.find((definition) => definition.id === activeDefinitionId) ?? pharmacologyDefinitions[0],
    [activeDefinitionId],
  )

  useEffect(() => {
    if (!isRunning) return undefined
    const timer = window.setInterval(() => {
      setTimeline((previous) => {
        const latest = previous[previous.length - 1] ?? initialPatientState
        const nextStep = simulateStep(latest, selectedMedications, selectedTreatments, executionQuality)
        return [...previous, nextStep]
      })
    }, 1100)
    return () => window.clearInterval(timer)
  }, [executionQuality, isRunning, selectedMedications, selectedTreatments])

  const toggleMedication = (id) => {
    setSelectedMedicationIds((current) => {
      if (current.includes(id)) {
        const next = current.filter((item) => item !== id)
        setDoseByMedication((doses) => {
          const updated = { ...doses }
          delete updated[id]
          return updated
        })
        setFrequencyByMedication((frequencies) => {
          const updated = { ...frequencies }
          delete updated[id]
          return updated
        })
        return next
      }
      const medication = gadSimulationDataset.medications.find((item) => item.id === id)
      setDoseByMedication((doses) => ({ ...doses, [id]: medication?.dosing.initialDose ?? 25 }))
      setFrequencyByMedication((frequencies) => ({ ...frequencies, [id]: medication?.dosing.defaultFrequency ?? 'onceDailyMorning' }))
      return [...current, id]
    })
  }

  const updateDose = (id, value) => {
    setDoseByMedication((current) => ({ ...current, [id]: Number(value) }))
  }

  const updateFrequency = (id, value) => {
    setFrequencyByMedication((current) => ({ ...current, [id]: value }))
  }

  const toggleTreatment = (id) => {
    setSelectedTreatments((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]))
  }

  const resetSimulation = () => {
    setTimeline([initialPatientState])
    setIsRunning(false)
  }

  const startSimulation = () => {
    setTimeline([initialPatientState])
    setIsRunning(false)
    setStage('simulation')
  }

  const returnToSelection = () => {
    setStage('selection')
    setIsRunning(false)
  }

  const advanceSimulation = () => {
    setTimeline((previous) => {
      const latest = previous[previous.length - 1] ?? initialPatientState
      const nextStep = simulateStep(latest, selectedMedications, selectedTreatments, executionQuality)
      return [...previous, nextStep]
    })
  }

  const warnings = useMemo(() => {
    const warningsList = []
    selectedMedications.forEach((entry) => {
      const zone = getDoseZone(entry.medication, entry.dose)
      if (zone === 'subtherapeutic') {
        warningsList.push(`Dose is below the therapeutic range for ${entry.medication.genericName}.`)
      }
      if (zone === 'high-risk') {
        warningsList.push(`Dose is above the usual therapeutic window for ${entry.medication.genericName}.`)
      }
      if (zone === 'extreme') {
        warningsList.push(`${entry.medication.genericName} is in the extreme simulated dose range — modeling shows diminishing benefit alongside much higher side-effect, sedation, and safety risk. Educational scenario only.`)
      }
    })

    if (executionQuality < 70) {
      warningsList.push('Execution quality is low, so effect will be less reliable.')
    }

    if (selectedMedications.length > 1) {
      warningsList.push('Multiple medications are increasing the chance of cumulative side effects and interaction burden.')
    }

    return warningsList
  }, [executionQuality, selectedMedications])

  return (
    <div className={`app-shell ${isDarkMode ? 'theme-dark' : 'theme-light'}`}>
      <header className="app-header">
        <div className="header-top">
          <div>
            <p className="eyebrow">Interactive clinical simulation</p>
            <h1>MedLearn: Generalized Anxiety Disorder Treatment Lab</h1>
          </div>
          <button
            className={`theme-toggle ${isDarkMode ? 'toggle-light' : 'toggle-dark'}`}
            onClick={() => setIsDarkMode((value) => !value)}
          >
            {isDarkMode ? '☀️ Light mode' : '🌙 Dark mode'}
          </button>
        </div>
        <div className="header-meta">
          <p className="subtitle">
            Build a treatment plan first, then launch the simulation to watch how the patient progresses over time.
          </p>
          <div className="info-pill-row">
            <span className="info-pill">Brain-focused mechanisms</span>
            <span className="info-pill">Dose-zone guidance</span>
            <span className="info-pill">Clinical reasoning cues</span>
          </div>
        </div>
      </header>

      {stage === 'selection' ? (
        <main className="selection-layout">
          <section className="card control-card">
            <div className="section-head">
              <div>
                <p className="eyebrow compact">Step 1 • Plan the case</p>
                <h2>Choose the treatment strategy</h2>
              </div>
            </div>

            <div className="section-block">
              <h3>Adjunctive therapies</h3>
              <div className="button-row">
                {gadSimulationDataset.nonPharmacologicTreatments.map((treatment) => (
                  <button
                    key={treatment.id}
                    className={selectedTreatments.includes(treatment.id) ? 'pill active' : 'pill'}
                    onClick={() => toggleTreatment(treatment.id)}
                  >
                    {treatment.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="section-block">
              <h3>Medications</h3>
              <div className="button-row">
                {gadSimulationDataset.medications.map((medication) => (
                  <button
                    key={medication.id}
                    className={selectedMedicationIds.includes(medication.id) ? 'pill active' : 'pill'}
                    onClick={() => toggleMedication(medication.id)}
                  >
                    {medication.genericName}
                  </button>
                ))}
              </div>
            </div>

            <div className="section-block">
              <h3>Execution quality</h3>
              <input
                className="slider"
                type="range"
                min="40"
                max="100"
                value={executionQuality}
                onChange={(event) => setExecutionQuality(Number(event.target.value))}
              />
              <p className="helper-text">{executionQuality}% execution quality — timing, dose accuracy, and consistency over time.</p>
            </div>

            <div className="section-block">
              <h3>Medication plan</h3>
              {selectedMedications.length === 0 ? (
                <p className="helper-text">No medications selected. The simulation will reflect a non-pharmacologic approach only.</p>
              ) : (
                selectedMedications.map((entry) => {
                  const medication = entry.medication
                  const zone = getDoseZone(medication, entry.dose)
                  const normalizedDose = Number.isFinite(Number(entry.dose)) ? Number(entry.dose) : medication.dosing.initialDose
                  const typicalMin = medication?.dosing?.typicalDoseRange?.min
                  const sliderMin = medication.drugClass === 'Benzodiazepine'
                    ? Math.max(0, (Number.isFinite(Number(typicalMin)) ? Number(typicalMin) : 0) - 0.5)
                    : Math.max(0, (Number.isFinite(Number(typicalMin)) ? Number(typicalMin) : 0) - 25)

                  const sliderMax = getExtremeCap(medication)

                  const extremeCapByMedication = {
                    sertraline: 1000,
                    escitalopram: 100,
                    venlafaxine: 900,
                    duloxetine: 600,
                    buspirone: 100,
                    alprazolam: 20,
                  }

                  const extremeCap = extremeCapByMedication[medication.id] ?? sliderMax
                  const sliderMaxAdjusted = Math.max(sliderMax, extremeCap)

                  const extremeWarningTextByMedication = {
                    sertraline: 'Extreme/Toxic: >1000 mg/day — serotonin syndrome, seizures, cardiac risk',
                    escitalopram: 'Extreme/Toxic: >100 mg/day — severe QT prolongation, seizures, arrhythmia',
                    venlafaxine: 'Extreme/Toxic: >900 mg/day — seizures, cardiotoxicity',
                    duloxetine: 'Extreme/Toxic: >600 mg/day — seizures, serotonin syndrome',
                    buspirone: 'Extreme/Toxic: >100 mg/day — toxicity still possible',
                    alprazolam: 'Extreme/Toxic: >20 mg/day — respiratory depression (esp. with alcohol/opioids) ',
                  }
                  const extremeWarningText = extremeWarningTextByMedication[medication.id] ?? 'Extreme/Toxic: far beyond typical ranges.'

                  const sliderExt = medication.id === 'alprazolam' ? 'mg/day' : 'mg/day'

                  return (

                    <div key={entry.id} className="med-card">
                      <div className="med-card-head">
                        <div>
                          <h4>{medication.genericName}</h4>
                          <p>{medication.brandNames.join(', ')} • {medication.drugClass}</p>
                        </div>
                        <span className={`zone-pill ${zone}`}>{zone}</span>
                      </div>

                      <p className="helper-text">{entry.medication.definition}</p>

                      <div className="dose-meta">
                        <span className="dose-current">{normalizedDose} mg/day</span>
                        <span className="dose-zone-text">
                          {zone === 'therapeutic'
                            ? 'Therapeutic range'
                            : zone === 'subtherapeutic'
                            ? 'Subtherapeutic'
                            : zone === 'high-risk'
                            ? 'High-risk (above-label)'
                            : 'Extreme/Toxic range'}
                        </span>
                      </div>

                      <div className="dose-range-table" role="group" aria-label={`${medication.genericName} dosage ranges`}>
                        <div className="dose-range-row">
                          <span className="dose-range-label subtherapeutic">Subtherapeutic</span>
                          <span className="dose-range-value">
                            {medication.dosing.typicalDoseRange?.min != null ? `<${medication.dosing.typicalDoseRange.min} mg/day` : '<—'}
                          </span>
                        </div>
                        <div className="dose-range-row">
                          <span className="dose-range-label therapeutic">Therapeutic</span>
                          <span className="dose-range-value">
                            {medication.dosing.typicalDoseRange?.min != null && medication.dosing.typicalDoseRange?.max != null
                              ? `${medication.dosing.typicalDoseRange.min}–${medication.dosing.typicalDoseRange.max} mg/day`
                              : '—'}
                          </span>
                        </div>
                        <div className="dose-range-row">
                          <span className="dose-range-label high-risk">High-Risk</span>
                          <span className="dose-range-value">
                            {medication.id === 'sertraline' ? '200–400 mg/day'
                              : medication.id === 'escitalopram' ? '20–40 mg/day'
                              : medication.id === 'venlafaxine' ? '300–375+ mg/day'
                              : medication.id === 'duloxetine' ? '>120 mg/day'
                              : medication.id === 'buspirone' ? '60–90 mg/day'
                              : medication.id === 'alprazolam' ? '4–10 mg/day'
                              : '—'}
                          </span>
                        </div>
                        <div className="dose-range-row">
                          <span className="dose-range-label extreme">Extreme/Toxic</span>
                          <span className="dose-range-value">
                            {medication.id === 'sertraline' ? '>1000 mg/day — serotonin syndrome, seizures, cardiac risk'
                              : medication.id === 'escitalopram' ? '>100 mg/day — severe QT prolongation, seizures, arrhythmia'
                              : medication.id === 'venlafaxine' ? '>900 mg/day — seizures, cardiotoxicity'
                              : medication.id === 'duloxetine' ? '>600 mg/day — seizures, serotonin syndrome'
                              : medication.id === 'buspirone' ? '>100 mg/day — toxicity still possible'
                              : medication.id === 'alprazolam' ? '>20 mg/day — respiratory depression (esp. with alcohol/opioids)'
                              : '—'}
                          </span>
                        </div>
                      </div>


                      <label className="input-label">
                        Dose tuning
                        <input
                          className="slider"
                          type="range"
                          min={sliderMin}
                          max={sliderMaxAdjusted}
                          step={medication.drugClass === 'Benzodiazepine' ? 0.25 : 5}

                          value={normalizedDose}
                          onChange={(event) => updateDose(entry.id, event.target.value)}
                        />
                      </label>
                      <p className="helper-text subtle">
                        Typical max is {medication.dosing.typicalDoseRange.max} mg/day. This slider goes up to {sliderMax} mg/day so you can explore high-risk and extreme simulated scenarios.
                      </p>
                      {zone === 'extreme' && (
                        <p className="helper-text extreme-warning">
                          {extremeWarningText}
                          <br />
                          Expect diminishing anxiety relief alongside sharply higher side effects and sedation.
                        </p>
                      )}


                      <div className="frequency-row">
                        {frequencyOptions.map((option) => (
                          <button
                            key={option.key}
                            className={entry.frequency === option.key ? 'pill active small' : 'pill small'}
                            onClick={() => updateFrequency(entry.id, option.key)}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                      <p className="helper-text">{getFrequencyHint(entry.frequency)}</p>
                    </div>
                  )
                })
              )}
            </div>
          </section>

          <aside className="card side-card">
            <div className="section-block">
              <div className="section-head compact-head">
                <h3>Neurobiology explorer</h3>
                <div className="button-row compact-row">
                  <button className={neuroView === 'brain' ? 'pill active small' : 'pill small'} onClick={() => setNeuroView('brain')}>Brain</button>
                  <button className={neuroView === 'body' ? 'pill active small' : 'pill small'} onClick={() => setNeuroView('body')}>Body</button>
                </div>
              </div>
              <div className="button-row">
                {pharmacologyDefinitions.map((definition) => (
                  <button
                    key={definition.id}
                    className={activeDefinitionId === definition.id ? 'pill active small' : 'pill small'}
                    onClick={() => setActiveDefinitionId(definition.id)}
                  >
                    {definition.title}
                  </button>
                ))}
              </div>
              <div className="definition-card">
                <div className="definition-card-head">
                  <div>
                    <h4>{activeDefinition.title}</h4>
                    <p>{activeDefinition.short}</p>
                  </div>
                  <span className="definition-badge">Quick definition</span>
                </div>
                <div className="definition-body">
                  <p className="definition-summary">{activeDefinition.summary}</p>
                  <p className="definition-detail">
                    {activeDefinition.highlights.join(' • ')}
                  </p>
                </div>
              </div>
            </div>

            <div className="section-block">
              <h3>Mechanism spotlight</h3>
              {selectedMedications.length > 1 ? (
                <div className="tabs-row">
                  {selectedMedications.map((entry) => (
                    <button
                      key={entry.id}
                      className={activeMechanismId === entry.id ? 'pill active small' : 'pill small'}
                      onClick={() => setActiveMechanismId(entry.id)}
                    >
                      {entry.medication.genericName}
                    </button>
                  ))}
                </div>
              ) : null}
              {spotlightMedication ? (
                <BrainMapCard medication={spotlightMedication} selectedCount={selectedMedications.length} neuroView={neuroView} onSelectMedication={setActiveMechanismId} />
              ) : (
                <p className="helper-text">Select a medication to view its synaptic, brain-circuit, and body-system effects.</p>
              )}
            </div>

            <div className="section-block">
              <h3>Plan summary</h3>
              <ul className="summary-list">
                <li><strong>Medications:</strong> {selectedMedications.length > 0 ? selectedMedications.map((entry) => entry.medication.genericName).join(', ') : 'None selected'}</li>
                <li><strong>Support:</strong> {therapyItems.length > 0 ? therapyItems.map((item) => item.name).join(', ') : 'No support selected'}</li>
                <li><strong>Execution:</strong> {executionQuality}%</li>
              </ul>
              <button className="pill primary" onClick={startSimulation}>Launch simulation</button>
            </div>
          </aside>
        </main>
      ) : (
        <main className="simulation-layout">
          <section className="card board-card">
            <div className="section-head">
              <div>
                <p className="eyebrow compact">Step 2 • Simulation</p>
                <h2>Patient overview</h2>
              </div>
              <div className="simulation-controls">
                <button className="pill" onClick={() => setIsRunning((value) => !value)}>{isRunning ? 'Pause' : 'Play'}</button>
                <button className="pill" onClick={advanceSimulation}>Advance 7 days</button>
                <button className="pill" onClick={resetSimulation}>Reset</button>
              </div>
              <button className="pill primary back-button" onClick={returnToSelection}>Back to main</button>
            </div>

            <div className="status-grid">
              <div className="status-card">
                <span className="label">Day</span>
                <strong>{currentPoint.day}</strong>
              </div>
              <div className="status-card">
                <span className="label">Anxiety severity</span>
                <strong>{currentPoint.anxietySeverity}/100</strong>
              </div>
              <div className="status-card">
                <span className="label">Side effect burden</span>
                <strong>{currentPoint.sideEffectBurden}/100</strong>
              </div>
              <div className="status-card">
                <span className="label">Sedation</span>
                <strong>{currentPoint.sedationLevel}/100</strong>
              </div>
            </div>

            <div className="chart-grid">
              <div className="chart-card">
                <h3>Anxiety over time</h3>
                <LineChart data={timeline} dataKey="anxietySeverity" color="#4f6ef7" max={100} />
              </div>
              <div className="chart-card">
                <h3>Side effects over time</h3>
                <LineChart data={timeline} dataKey="sideEffectBurden" color="#ef6f6c" max={100} />
              </div>
            </div>

            <div className="warning-box">
              <h3>Decision feedback</h3>
              {warnings.length === 0 ? <p>No major warnings at this time.</p> : warnings.map((warning) => <p key={warning}>{warning}</p>)}
            </div>
          </section>

          <aside className="card side-card">
            <div className="section-block">
              <h3>Active plan</h3>
              <ul className="summary-list">
                <li><strong>Medication(s):</strong> {selectedMedications.length > 0 ? selectedMedications.map((entry) => entry.medication.genericName).join(', ') : 'None selected'}</li>
                <li><strong>Support:</strong> {therapyItems.length > 0 ? therapyItems.map((item) => item.name).join(', ') : 'None'}</li>
                <li><strong>Execution quality:</strong> {executionQuality}%</li>
              </ul>
            </div>

            <div className="section-block">
              <h3>Why this matters</h3>
              <p className="helper-text">The simulation shows how dose, schedule, adherence, and therapeutic support influence anxiety burden and tolerability over time.</p>
            </div>
          </aside>
        </main>
      )}

      <footer className="disclaimer">
        {gadSimulationDataset.disclaimer}
      </footer>
    </div>
  )
}

export default App

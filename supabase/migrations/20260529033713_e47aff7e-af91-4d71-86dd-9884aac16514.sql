UPDATE public.patient_exam_results
SET category = CASE 
    WHEN marker_name ILIKE ANY (ARRAY['%Colesterol%', '%HDL%', '%LDL%', '%VLDL%', '%Triglicerid%', '%Trigliceri%']) THEN 'perfil_lipidico'
    WHEN marker_name ILIKE ANY (ARRAY['%Glicose%', '%Insulina%', '%Hemoglobina Glicada%', '%HBA1C%', '%HOMA%']) THEN 'perfil_glicidico'
    WHEN marker_name ILIKE ANY (ARRAY['%TSH%', '%T3%', '%T4%', '%Tiroxina%', '%Triiodotironina%']) THEN 'perfil_tireoidiano'
    WHEN marker_name ILIKE ANY (ARRAY['%Hemoglobina%', '%Hematócrito%', '%Hematocrito%', '%Leucócitos%', '%Leucocitos%', '%Plaquetas%', '%Eritrócitos%', '%Eritrocitos%', '%VCM%', '%HCM%', '%CHCM%', '%RDW%', '%Linfócitos%', '%Monócitos%', '%Bastões%', '%Segmentados%', '%Eosinófilos%', '%Basófilos%']) THEN 'hemograma'
    WHEN marker_name ILIKE ANY (ARRAY['%Creatinina%', '%Ureia%', '%Ureia%', '%Sódio%', '%Sodio%', '%Potássio%', '%Potassio%', '%Cálcio%', '%Calcio%', '%Fósforo%', '%Fosforo%', '%Cloreto%']) THEN 'funcao_renal'
    WHEN marker_name ILIKE ANY (ARRAY['%TGO%', '%AST%', '%TGP%', '%ALT%', '%Bilirrubina%', '%Gama GT%', '%GGT%', '%Fosfatase Alcalina%']) THEN 'funcao_hepatica'
    WHEN marker_name ILIKE ANY (ARRAY['%Vitamina%', '%Ferro%', '%Zinco%', '%Magnésio%', '%Magnesio%', '%Ferritina%', '%Transferrina%', '%B12%', '%Ácido Fólico%', '%Folato%']) THEN 'vitaminas_minerais'
    WHEN marker_name ILIKE ANY (ARRAY['%PCR%', '%Proteína C Reativa%', '%VHS%', '%Homocisteína%']) THEN 'inflamatorio'
    WHEN marker_name ILIKE ANY (ARRAY['%Testosterona%', '%Estradiol%', '%Progesterona%', '%Prolactina%', '%Cortisol%', '%DHEA%', '%SHBG%', '%LH%', '%FSH%']) THEN 'perfil_hormonal'
    WHEN marker_name ILIKE ANY (ARRAY['%TAP%', '%TTPA%', '%INR%', '%Fibrinogênio%']) THEN 'coagulacao'
    ELSE 'outros'
END
WHERE category IS NULL OR category = 'outros';
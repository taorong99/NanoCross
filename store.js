// store.js - 核心数据中心：管理工艺步骤、全局变量以及封装对这些数据的增删改操作

function useStore() {
    const { ref, computed } = Vue;

    // 默认工艺步骤
    const processSteps = ref([
        { id: 1, name: 'Substrate', type: 'deposit', thickness: 40, angle: 90, color: '#bdc3c7', visible: true, patterns: [{ x: 0, w: 600 }] },
        { id: 2, name: 'M1 (CPW)', type: 'deposit', thickness: 30, angle: 75, color: '#f1c40f', visible: true, patterns: [{ x: -120, w: 60 }, { x: 0, w: 60 }, { x: 120, w: 60 }] },
        { id: 3, name: 'ILD 1', type: 'deposit', thickness: 80, angle: 90, color: 'rgba(52, 152, 219, 0.4)', visible: true, patterns: [{ x: 0, w: 600 }] },
        { id: 4, name: 'Via 1', type: 'etch', thickness: 80, angle: 85, color: 'transparent', visible: true, patterns: [{ x: -120, w: 20 }, { x: 120, w: 20 }] },
        { id: 5, name: 'M2 (Top)', type: 'deposit', thickness: 30, angle: 75, color: '#e67e22', visible: true, patterns: [{ x: 0, w: 350 }] },
        { id: 6, name: 'CMP 平坦化', type: 'cmp', thickness: 10, angle: 90, color: 'transparent', visible: true, patterns: [] }
    ]);

    const variables = ref([
        { name: 'w1', value: '60' },
        { name: 'gap', value: '120' }
    ]);

    const projectName = ref('');

    const activeLayerIndex = ref(0);
    const activeStep = computed(() => processSteps.value[activeLayerIndex.value]);

    const engineResult = ref({ profiles: [], minX: 0, maxX: 0, subLeft: -400, subRight: 400, maxH: 300 });

    const safeEval = (expr, scope) => {
        if (typeof expr !== 'string') return expr || 0;
        if (!expr.trim()) return 0;
        try { return window.math.evaluate(expr, scope) || 0; }
        catch (e) { return 0; }
    };

    // 安全地将当前带变量的步骤解析为供引擎计算的纯数字表示
    const getParsedSteps = () => {
        let scope = {};
        variables.value.forEach(v => {
            if(v.name && v.value) { 
                try { scope[v.name] = window.math.evaluate(v.value, scope); } catch(e) {} 
            }
        });
        return processSteps.value.map(step => {
            let newStep = { ...step };
            if (step.patterns) {
                newStep.patterns = step.patterns.map(p => ({
                    x: safeEval(p.x, scope),
                    w: safeEval(p.w, scope)
                }));
            }
            return newStep;
        });
    };

    const addPattern = () => {
        if (activeStep.value) {
            if (!activeStep.value.patterns) activeStep.value.patterns = [];
            activeStep.value.patterns.push({ x: 0, w: 100 });
        }
    };

    const removePattern = (idx) => {
        if (activeStep.value) activeStep.value.patterns.splice(idx, 1);
    };

    const addStep = (type) => {
        const subThickness = processSteps.value[0] ? processSteps.value[0].thickness : 40;
        const subWidth = (processSteps.value[0] && processSteps.value[0].patterns && processSteps.value[0].patterns[0]) ? processSteps.value[0].patterns[0].w : 600;
        
        let newThickness = 20;
        let newPatterns = [];
        
        if (type === 'cmp') {
            newThickness = 10;
        } else if (type === 'deposit') {
            newThickness = Math.round(subThickness / 2);
            newPatterns = [{ x: 0, w: subWidth }];
        } else if (type === 'etch') {
            newThickness = Math.round(subThickness / 2);
            newPatterns = [{ x: 0, w: Math.round(subWidth / 10) }];
        }

        processSteps.value.push({
            id: Date.now(), 
            name: `New ${type}`, 
            type: type, 
            thickness: newThickness, 
            angle: 90, 
            color: type === 'deposit' ? '#e74c3c' : 'transparent', 
            visible: true, 
            patterns: newPatterns
        });
        activeLayerIndex.value = processSteps.value.length - 1;
    };

    const deleteStep = (idx) => {
        if (idx === 0) { alert("衬底是基础图案，不能删除！"); return; }
        processSteps.value.splice(idx, 1);
        activeLayerIndex.value = Math.max(0, activeLayerIndex.value - 1);
    };

    const toggleVisibility = (idx) => {
        const step = processSteps.value[idx];
        if (!step) return;
        if (step.visible) {
            processSteps.value.forEach((s, i) => { if(i >= idx) s.visible = false; });
        } else {
            processSteps.value.forEach(s => s.visible = true);
        }
    };

    return {
        projectName,
        processSteps,
        variables,
        activeLayerIndex,
        activeStep,
        engineResult,
        getParsedSteps,
        addPattern,
        removePattern,
        addStep,
        deleteStep,
        toggleVisibility
    };
}

// history.js - 负责处理撤销、重做与历史记录栈的管理

function useHistory(processSteps, variables) {
    const { ref } = Vue;
    
    const historyStack = ref([]);
    const historyIndex = ref(-1);
    let isUndoing = false;
    let historyTimer = null;

    const pushHistory = () => {
        if (isUndoing) return;

        clearTimeout(historyTimer);
        historyTimer = setTimeout(() => {
            if (historyIndex.value < historyStack.value.length - 1) {
                historyStack.value = historyStack.value.slice(0, historyIndex.value + 1);
            }
            historyStack.value.push({
                steps: JSON.parse(JSON.stringify(processSteps.value)),
                vars: JSON.parse(JSON.stringify(variables.value))
            });
            historyIndex.value++;
        }, 1000); // 延迟1000ms，让连续修改（如滑块拖动）只保存最后一次
    };

    const undo = () => {
        if (historyIndex.value > 0) {
            clearTimeout(historyTimer);
            isUndoing = true;
            historyIndex.value--;
            const state = historyStack.value[historyIndex.value];
            processSteps.value = JSON.parse(JSON.stringify(state.steps));
            variables.value = JSON.parse(JSON.stringify(state.vars));
            setTimeout(() => { isUndoing = false; }, 50);
        }
    };

    const redo = () => {
        if (historyIndex.value < historyStack.value.length - 1) {
            clearTimeout(historyTimer);
            isUndoing = true;
            historyIndex.value++;
            const state = historyStack.value[historyIndex.value];
            processSteps.value = JSON.parse(JSON.stringify(state.steps));
            variables.value = JSON.parse(JSON.stringify(state.vars));
            setTimeout(() => { isUndoing = false; }, 50);
        }
    };

    const getIsUndoing = () => isUndoing;

    return { 
        historyStack, 
        historyIndex, 
        pushHistory, 
        undo, 
        redo, 
        getIsUndoing 
    };
}

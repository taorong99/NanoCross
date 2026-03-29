// app.js - 核心应用入口：负责组装各个模块，并挂载 Vue 实例
const { createApp, ref, watch, onMounted, onUnmounted } = Vue;

const App = {
    setup() {
        // 1. 获取各个模块的状态
        const store = useStore();
        const history = useHistory(store.processSteps, store.variables);
        
        // UI 交互状态
        const variablesMinimized = ref(false);
        const hoverLayerIndex = ref(-1);
        const hoverPatternIndex = ref(-1);
        const focusedPatternIndex = ref(-1);
        const flashingPatternIndex = ref(-1);
        const hoverCardPatternIndex = ref(-1);
        
        // 布局尺寸
        const triggerResize = ref(0);
        const layersWidth = ref(250);
        const propsWidth = ref(300);
        let activeResizer = null;

        // 画布属性，将需要依赖的全局数据传入
        const canvasProps = useCanvas(
            store.engineResult, 
            triggerResize, 
            store.parsedSteps, // 使用解析变量后的步骤，避免画布获取到 undefined 坐标
            store.activeLayerIndex, 
            hoverLayerIndex, 
            hoverPatternIndex, 
            focusedPatternIndex, 
            flashingPatternIndex, 
            hoverCardPatternIndex
        );

        // 2. 核心联动：当参数改变时更新仿真计算并记录历史
        const updateSimulation = () => {
            if (window.calculateProfiles) {
                const parsed = store.getParsedSteps();
                const currentResult = window.calculateProfiles(parsed);
                // 运行一次所有视为可见的总高度，用于锁定 viewBox 视角不乱跳
                const fullParsed = parsed.map(s => ({ ...s, visible: true }));
                const fullResult = window.calculateProfiles(fullParsed);
                currentResult.fullMaxH = fullResult.maxH;
                store.engineResult.value = currentResult;
            }
            if (!history.getIsUndoing()) {
                history.pushHistory();
            }
        };

        watch(store.processSteps, updateSimulation, { deep: true });
        watch(store.variables, updateSimulation, { deep: true });

        // 只重置聚焦状态
        watch(store.activeLayerIndex, () => {
            focusedPatternIndex.value = -1;
            flashingPatternIndex.value = -1;
        });

        const globalMouseUp = (e) => {
            endResize();
            if (canvasProps.endPan) canvasProps.endPan(e);
        };
        const globalMouseMove = (e) => {
            doResize(e);
            if (canvasProps.doPan) canvasProps.doPan(e);
        };

        // 3. 生命周期与全局事件
        onMounted(() => {
            updateSimulation();
            history.pushHistory();
            window.addEventListener('keydown', handleKeyDown);
            window.addEventListener('mouseup', globalMouseUp);
            window.addEventListener('mousemove', globalMouseMove);
        });

        onUnmounted(() => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('mouseup', globalMouseUp);
            window.removeEventListener('mousemove', globalMouseMove);
        });

        // 4. 事件处理器
        const handleKeyDown = (e) => {
            if ((e.target.tagName === 'INPUT' && e.target.type !== 'range') || e.target.tagName === 'TEXTAREA') return;
            // 撤销/重做
            if (e.ctrlKey && e.key.toLowerCase() === 'z') { e.preventDefault(); history.undo(); return; }
            if (e.ctrlKey && e.key.toLowerCase() === 'y') { e.preventDefault(); history.redo(); return; }
            // 键盘平移给 canvas 处理
            if (canvasProps.handleKeyDown) canvasProps.handleKeyDown(e);
        };

        const onCanvasPatternClick = (layerIdx, pIdx) => {
            store.activeLayerIndex.value = layerIdx;
            setTimeout(() => { 
                flashingPatternIndex.value = pIdx; 
                focusedPatternIndex.value = -1; 
            }, 10);
        };

        // 窗口拖拽大小
        const startResize = (e, panel) => { 
            activeResizer = panel; 
            document.body.style.cursor = 'col-resize'; 
        };
        const doResize = (e) => {
            if (!activeResizer) return;
            if (activeResizer === 'layers') { 
                layersWidth.value = Math.max(150, Math.min(e.clientX, 500)); 
            } else if (activeResizer === 'props') { 
                propsWidth.value = Math.max(200, Math.min(e.clientX - (layersWidth.value + 6), 600)); 
            }
        };
        const endResize = () => { 
            activeResizer = null; 
            document.body.style.cursor = 'default'; 
        };

        // 拖拽步骤排序
        const onDragStart = (e, index) => { 
            if (index === 0) return; 
            e.dataTransfer.setData('stepIndex', index); 
        };
        const onDrop = (e, index) => {
            if (index === 0) return;
            const dragIndex = parseInt(e.dataTransfer.getData('stepIndex'), 10);
            if (dragIndex) {
                const item = store.processSteps.value.splice(dragIndex, 1)[0];
                store.processSteps.value.splice(index, 0, item);
            }
        };

        // 文件导入导出
        const exportFile = () => {
            alert('导出功能预留：未来可支持导出其他格式。');
        };

        const loadFile = async () => {
            let useLocal = false;
            try {
                // 试图从服务器获取可选的项目列表
                const res = await fetch('/api/designs');
                if (!res.ok) {
                    useLocal = true;
                } else {
                    const projects = await res.json();
                    if (projects.length === 0) {
                        alert('服务器上还没有保存任何项目。');
                        return;
                    }
                    
                    const listText = projects.join('\n- ');
                    const inputName = prompt(`请输入要加载的项目名称 (不带.json):\n\n当前服务器包含以下项目:\n- ${listText}`);
                    if (!inputName) return; 

                    const loadRes = await fetch(`/api/load/${encodeURIComponent(inputName)}`);
                    if (!loadRes.ok) throw new Error(`项目 "${inputName}" 不存在或读取失败`);
                    
                    const data = await loadRes.json();
                    applyData(data);
                }
            } catch (err) {
                useLocal = true;
            }

            if (useLocal) {
                alert('未检测到后端环境连接。\n即将切换至【本地文件读取模式】加载文件...');
                // 兜底方案：本地文件选择加载
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.json';
                input.onchange = (e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = (re) => {
                        try {
                            const data = JSON.parse(re.target.result);
                            applyData(data);
                        } catch (err) {
                            alert('无效的 JSON 文件格式');
                        }
                    };
                    reader.readAsText(file);
                };
                input.click();
            }
        };

        const applyData = (data) => {
            if (data.projectName) {
                store.projectName.value = data.projectName;
            }
            if (data.variables && Array.isArray(data.variables)) {
                store.variables.value = data.variables;
            }
            if (data.processSteps && Array.isArray(data.processSteps)) {
                store.processSteps.value = data.processSteps;
                store.activeLayerIndex.value = Math.max(0, data.processSteps.length - 1);
                if (history && history.pushHistory) {
                    setTimeout(history.pushHistory, 100);
                }
            } else {
                alert('获取到的文件格式无效（缺少 processSteps 数据）');
            }
        };

        const saveFile = async () => {
            let nameToSave = store.projectName.value;
            if (!nameToSave || nameToSave.trim() === '') {
                const name = prompt("请输入项目名称：");
                if (name && name.trim() !== '') {
                    nameToSave = name.trim();
                    store.projectName.value = nameToSave;
                } else {
                    return; 
                }
            }
            
            const saveData = {
                projectName: nameToSave,
                variables: store.variables.value,
                processSteps: store.processSteps.value
            };

            let useLocal = false;
            try {
                const response = await fetch('/api/save', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(saveData)
                });
                
                if (response.ok) {
                    alert(`保存成功！数据已后台写入 /designs/${nameToSave}.json`);
                } else {
                    useLocal = true;
                }
            } catch (err) {
                useLocal = true;
            }

            if (useLocal) {
                alert('未检测到后端环境连接。\n即将切换至【浏览器下载模式】保存当前设计...');
                // 兜底方案：通过浏览器下载 JSON 文件到本地
                const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(saveData, null, 4));
                const downloadAnchorNode = document.createElement('a');
                downloadAnchorNode.setAttribute("href", dataStr);
                downloadAnchorNode.setAttribute("download", `${nameToSave}.json`);
                document.body.appendChild(downloadAnchorNode); 
                downloadAnchorNode.click();
                downloadAnchorNode.remove();
            }
        };

        // 5. 导出供模板使用
        return {
            ...store,
            ...canvasProps,
            history,
            loadFile,
            saveFile,
            exportFile,
            undo: history.undo,
            redo: history.redo,
            canUndo: history.canUndo,
            canRedo: history.canRedo,
            variablesMinimized,
            hoverLayerIndex, 
            hoverPatternIndex, 
            focusedPatternIndex, 
            flashingPatternIndex, 
            hoverCardPatternIndex,
            layersWidth, 
            propsWidth, 
            startResize, 
            triggerResize, 
            onDragStart, 
            onDrop, 
            onCanvasPatternClick
        };
    }
};

const app = createApp(App);
if (typeof registerComponents === 'function') {
    registerComponents(app);
}
app.mount('#app');

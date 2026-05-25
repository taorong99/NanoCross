// app.js - 核心应用入口：负责组装各个模块，并挂载 Vue 实例
const { createApp, ref, computed, watch, onMounted, onUnmounted } = Vue;

const App = {
    setup() {
        // 1. 获取各个模块的状态
        const store = useStore();
        const history = useHistory(store.processSteps, store.variables, store.flowDiagramSettings);
        
        // UI 交互状态
        const variablesMinimized = ref(false);
        const showExportMenu = ref(false);
        const showLegendSettingsModal = ref(false);
        const showFlowDiagramSettingsModal = ref(false);
        const legendModalPosition = ref({ left: '50px', top: '100px' });
        const FLOW_DIAGRAM_MODAL_WIDTH = 500;
        const flowDiagramModalPosition = ref({ left: '56px', top: '80px' });
        
        const openLegendSettings = () => {
            // 每次打开设在视口中间偏上
            const winWidth = window.innerWidth || document.documentElement.clientWidth || 1000;
            legendModalPosition.value.left = Math.max(0, (winWidth - 500) / 2) + 'px';
            legendModalPosition.value.top = '100px';
            showLegendSettingsModal.value = true;
        };

        const openFlowDiagramSettings = () => {
            const propertiesPanelRight = layersWidth.value + 6 + propsWidth.value;
            const left = Math.max(20, propertiesPanelRight - FLOW_DIAGRAM_MODAL_WIDTH);
            flowDiagramModalPosition.value.left = left + 'px';
            flowDiagramModalPosition.value.top = '80px';
            showFlowDiagramSettingsModal.value = true;
        };

        let dragInfo = { isDragging: false, startX: 0, startY: 0, initialLeft: 0, initialTop: 0 };
        const startDragLegendSettings = (e) => {
            dragInfo.isDragging = true;
            dragInfo.startX = e.clientX;
            dragInfo.startY = e.clientY;
            dragInfo.initialLeft = parseInt(legendModalPosition.value.left) || 0;
            dragInfo.initialTop = parseInt(legendModalPosition.value.top) || 0;
            
            document.addEventListener('mousemove', onDragLegendSettings);
            document.addEventListener('mouseup', endDragLegendSettings);
        };
        const onDragLegendSettings = (e) => {
            if (!dragInfo.isDragging) return;
            const dx = e.clientX - dragInfo.startX;
            const dy = e.clientY - dragInfo.startY;
            legendModalPosition.value.left = (dragInfo.initialLeft + dx) + 'px';
            legendModalPosition.value.top = (dragInfo.initialTop + dy) + 'px';
        };
        const endDragLegendSettings = () => {
            dragInfo.isDragging = false;
            document.removeEventListener('mousemove', onDragLegendSettings);
            document.removeEventListener('mouseup', endDragLegendSettings);
        };
        let flowDragInfo = { isDragging: false, startX: 0, startY: 0, initialLeft: 0, initialTop: 0 };
        const startDragFlowDiagramSettings = (e) => {
            flowDragInfo.isDragging = true;
            flowDragInfo.startX = e.clientX;
            flowDragInfo.startY = e.clientY;
            flowDragInfo.initialLeft = parseInt(flowDiagramModalPosition.value.left) || 0;
            flowDragInfo.initialTop = parseInt(flowDiagramModalPosition.value.top) || 0;

            document.addEventListener('mousemove', onDragFlowDiagramSettings);
            document.addEventListener('mouseup', endDragFlowDiagramSettings);
        };
        const onDragFlowDiagramSettings = (e) => {
            if (!flowDragInfo.isDragging) return;
            const dx = e.clientX - flowDragInfo.startX;
            const dy = e.clientY - flowDragInfo.startY;
            flowDiagramModalPosition.value.left = (flowDragInfo.initialLeft + dx) + 'px';
            flowDiagramModalPosition.value.top = (flowDragInfo.initialTop + dy) + 'px';
        };
        const endDragFlowDiagramSettings = () => {
            flowDragInfo.isDragging = false;
            document.removeEventListener('mousemove', onDragFlowDiagramSettings);
            document.removeEventListener('mouseup', endDragFlowDiagramSettings);
        };
        const showPreviewModal = ref(false);
        const previewImageUrl = ref('');
        const previewFileName = ref('');
        const mainSvgRef = ref(null);
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

        const toggleLegendLayer = (id) => {
            const arr = store.legendSettings.value.hiddenLegendIds;
            const idx = arr.indexOf(id);
            if (idx === -1) arr.push(id);
            else arr.splice(idx, 1);
        };

        const visibleFlowDiagramSteps = computed(() => {
            const hiddenIds = new Set(store.flowDiagramSettings.value.hiddenStepIds || []);
            return store.processSteps.value
                .map((step, index) => ({ step, index }))
                .filter(({ step }) => !hiddenIds.has(step.id));
        });

        // 图例数据计算，该计算属性根据当前的引擎计算结果(位置)及图例设置动态生成图例元素的呈现位置参数
        const legendData = computed(() => {
            const result = store.engineResult.value;
            const settings = store.legendSettings.value;
            
            let subL = result.subLeft !== undefined ? result.subLeft : -400;
            let subR = result.subRight !== undefined ? result.subRight : 400;
            
            let totalWidth = subR - subL;
            let startX = subL;
            
            if (settings.widthMode === 'custom') {
                totalWidth = settings.customWidth || 800;
                startX = (subL + subR) / 2 - totalWidth / 2; // 计算横向居中的起始坐标
            }
            
            // 筛选有效的需要展示在图例的步骤信息：这里由于只需提取有颜色标识的可视觉块，需要过滤出衬底信息和各类“deposit(沉积)”步骤，
            // 同时也需要滤除被用户在设置面板被手动取消勾选隐藏起来的图层 (hiddenLegendIds数组存在id则跳过该图层展示)
            const items = store.processSteps.value.filter((s, idx) => 
                (idx === 0 || s.type === 'deposit') && !settings.hiddenLegendIds.includes(s.id)
            );
            
            // 从设置栈里获取用户参数配置
            const marginTop = settings.marginTop !== undefined ? settings.marginTop : 40; 
            const itemsPerRow = settings.itemsPerRow || 4; 
            const iconSize = settings.iconSize || 20;
            
            const startY = 500 + marginTop;
            const rowHeight = Math.max(40, iconSize + 10);
            const fontSize = settings.fontSize || 14;
            
            let elements = [];
            
            if (settings.showLegend !== false) {
                // 计算每个元素排列在页面中的确切位置 (x、y) 与文本
                for (let i = 0; i < items.length; i++) {
                    let item = items[i];
                    let row = Math.floor(i / itemsPerRow);
                    let col = i % itemsPerRow;
                    
                    // 以整行的宽度平分供每个元素格内居中使用
                    const cellWidth = totalWidth / itemsPerRow;
                    let currX = startX + col * cellWidth;
                    let currY = startY + row * rowHeight;
                    
                    let text = '';
                    if (settings.textSource === 'material') {
                        text = item.material || 'Unnamed';
                    } else {
                        text = item.name || 'Unnamed';
                    }
                    
                    elements.push({
                        id: item.id,
                        x: currX,
                        y: currY,
                        color: item.color,
                        text: text
                    });
                }
            }
            
            const totalRows = Math.ceil(items.length / itemsPerRow);
            const contentHeight = settings.showLegend !== false ? totalRows * rowHeight : 20; // 即使隐藏图例，也保留 20 高度以展示右上角的设置齿轮
            
            // 返回包含所有单个图层块所需信息及边界框总体范围的属性集
            return {
                elements: elements,
                boxX: startX,
                boxY: startY - 10,
                boxW: totalWidth,
                boxH: contentHeight + 10,
                iconX: startX + totalWidth - 25,
                iconY: startY - 5,
                fontSize: fontSize
            };
        });

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
        watch(store.flowDiagramSettings, () => {
            if (!history.getIsUndoing()) {
                history.pushHistory();
            }
        }, { deep: true });

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
        const exportFile = (format) => {
            if (!mainSvgRef.value) return;

            // 1. 克隆 SVG 节点并预处理
            const clonedSvg = mainSvgRef.value.cloneNode(true);
            
            // 2. 清理不需要导出的元素 (背景网格、坐标轴、高亮框等)
            const ignores = clonedSvg.querySelectorAll('.export-ignore, .flashing-path');
            ignores.forEach(el => el.remove());

            // 3. 移除可能影响外部显示的内联样式，并动态剪裁 viewBox 以去除不必要的留白
            clonedSvg.style.position = '';
            clonedSvg.style.top = '';
            clonedSvg.style.left = '';
            clonedSvg.removeAttribute('width');
            clonedSvg.removeAttribute('height');

            // 提取物理引擎里图形的真实宽度和高度范围
            let resObj = store.engineResult.value;
            if (resObj && typeof resObj.subLeft === 'number') {
                const margin = 20; // 留一点边距
                const tightX = resObj.subLeft - margin;
                const tightWidth = (resObj.subRight - resObj.subLeft) + margin * 2;
                
                // maxH 是向上沉积的最大高度，0是基底表面。考虑到基底往下可能有一些刻蚀，稍微多取一些Y范围
                // Y轴坐标由于屏幕是向下的，物理Y 0对应的SVG Y是 500。
                const trueMaxH = resObj.fullMaxH !== undefined ? resObj.fullMaxH : resObj.maxH;
                const tightY = 500 - trueMaxH - margin;
                
                // 将 legendData 高度也计入导出 viewBox 中
                const maxY = legendData.value ? legendData.value.boxY + legendData.value.boxH + margin : 500 + 50 + margin;
                const tightHeight = Math.max(trueMaxH + margin * 2 + 50, maxY - tightY);

                clonedSvg.setAttribute('viewBox', `${tightX} ${tightY} ${tightWidth} ${tightHeight}`);
                // 修复在某些浏览器下 Canvas 绘制 SVG 发生裁剪的 Bug
                clonedSvg.setAttribute('width', `${tightWidth}px`);
                clonedSvg.setAttribute('height', `${tightHeight}px`);
            }

            // 4. 将 SVG 序列化为字符串
            const serializer = new XMLSerializer();
            let svgString = serializer.serializeToString(clonedSvg);
            
            // 修复可能缺少的 xmlns 声明 (虽然已经在 index.html 加了，但也防万一)
            if (!svgString.includes('xmlns="http://www.w3.org/2000/svg"')) {
                svgString = svgString.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
            }

            const fileName = (store.projectName.value || 'NanoCross_Project') + '-export';

            if (format === 'svg') {
                const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${fileName}.svg`;
                a.click();
                URL.revokeObjectURL(url);
            } 
            else if (format === 'png') {
                // 5. 利用 canvas 将 SVG 转 PNG，并拦截下载由前端弹窗提供预览
                const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
                const url = URL.createObjectURL(svgBlob);
                
                const img = new Image();
                img.onload = () => {
                    // 获取当前 viewBox 的尺寸比例
                    const viewBox = clonedSvg.getAttribute('viewBox');
                    let targetW = 1920; 
                    let targetH = 1080;
                    if (viewBox) {
                        const [, , vbW, vbH] = viewBox.split(' ').map(Number);
                        if (vbW && vbH) {
                            targetH = (vbH / vbW) * targetW; 
                        }
                    }

                    const canvas = document.createElement('canvas');
                    canvas.width = targetW;
                    canvas.height = targetH;
                    const ctx = canvas.getContext('2d');
                    
                    // 填充纯白色背景
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(0, 0, targetW, targetH);
                    
                    // 将 SVG 绘制到白色背景上
                    ctx.drawImage(img, 0, 0, targetW, targetH);
                    
                    const pngUrl = canvas.toDataURL('image/png');
                    previewImageUrl.value = pngUrl;
                    previewFileName.value = `${fileName}.png`;
                    showPreviewModal.value = true;
                    
                    URL.revokeObjectURL(url);
                };
                img.src = url;
            }
        };

        const confirmDownloadPng = () => {
            if (!previewImageUrl.value) return;
            const a = document.createElement('a');
            a.href = previewImageUrl.value;
            a.download = previewFileName.value;
            a.click();
            showPreviewModal.value = false;
        };

        const cancelDownloadPng = () => {
            showPreviewModal.value = false;
            previewImageUrl.value = '';
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
                store.processSteps.value = data.processSteps.map(store.normalizeProcessStep);
                store.activeLayerIndex.value = Math.max(0, data.processSteps.length - 1);
                if (history && history.pushHistory) {
                    setTimeout(history.pushHistory, 100);
                }
            } else {
                alert('获取到的文件格式无效（缺少 processSteps 数据）');
            }
            if (data.legendSettings) {
                Object.assign(store.legendSettings.value, data.legendSettings);
            }
            store.flowDiagramSettings.value = store.normalizeFlowDiagramSettings(data.flowDiagramSettings);
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
                processSteps: store.processSteps.value,
                legendSettings: store.legendSettings.value,
                flowDiagramSettings: store.flowDiagramSettings.value
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
            legendData,
            visibleFlowDiagramSteps,
            history,
            loadFile,
            saveFile,
            exportFile,
            showExportMenu,
            showLegendSettingsModal,
            showFlowDiagramSettingsModal,
            showPreviewModal,
            previewImageUrl,
            confirmDownloadPng,
            cancelDownloadPng,
            mainSvgRef,
            toggleLegendLayer,
            legendModalPosition,
            flowDiagramModalPosition,
            openLegendSettings,
            openFlowDiagramSettings,
            startDragLegendSettings,
            startDragFlowDiagramSettings,
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

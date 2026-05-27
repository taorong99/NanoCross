// components.js - 存放公共的自定义组件，提供给App实例挂载时使用

function registerComponents(app) {
    const { ref, watch } = Vue;

    // =========================================
    // 组件 1: 变量与自定义数值复合输入框
    // 支持下拉选择全局变量，或者手动输入纯数字的一体式控件
    // =========================================
    app.component('pattern-input', {
        props: ['modelValue', 'label', 'variables'],
        emits: ['update:modelValue'],
        setup(props, { emit }) {
            const checkIsVar = (val) => props.variables.some(v => v.name === val);
            const selectedType = ref(checkIsVar(props.modelValue) ? props.modelValue : 'custom');
            let initialCustom = Number(props.modelValue);
            const customValue = ref(isNaN(initialCustom) ? 0 : initialCustom);

            watch(() => props.modelValue, (newVal) => {
                if (checkIsVar(newVal)) {
                    selectedType.value = newVal;
                } else {
                    selectedType.value = 'custom';
                    customValue.value = Number(newVal) || 0;
                }
            });

            const updateModel = () => {
                 if (selectedType.value === 'custom') {
                     emit('update:modelValue', customValue.value);
                 } else {
                     emit('update:modelValue', selectedType.value);
                 }
            };

            const onTypeChange = () => {
                updateModel();
            };

            const onInput = () => {
                updateModel();
            };

            const onWheel = (e) => {
                if (selectedType.value === 'custom') {
                    e.preventDefault();
                    customValue.value += Math.sign(e.deltaY) * -10;
                    updateModel();
                }
            };

            return { customValue, selectedType, onTypeChange, onWheel, onInput };
        },
        template: `
            <div style="display: flex; flex-direction: column; width: 100%; min-width: 0;">
                <label style="font-size: 14px; color: #888;">{{ label }}</label>
                <div style="display: flex; gap: 2px; width: 100%;">
                    <select v-model="selectedType" @change="onTypeChange" class="form-control" style="font-size: 13px; padding: 0px 2px; height: 26px; flex: 1; min-width: 0;">
                        <option value="custom">自定义</option>
                        <option v-for="v in variables" :key="v.name" :value="v.name">{{ v.name }}</option>
                    </select>
                    <input v-if="selectedType === 'custom'" type="number" step="1" v-model.number="customValue" 
                        @input="onInput" @wheel="onWheel" @keyup.enter="$event.target.blur()" class="form-control" style="font-size: 13px; flex: 1; min-width: 0; height: 26px; padding: 2px;">
                </div>
            </div>
        `
    });

    // =========================================
    // 组件 2: 绑定数值的拖拽条与输入框同步组件
    // 将 input[type=range] 和 input[type=number] 组合，方便调节参数
    // =========================================
    app.component('slider-input', {
        props: ['modelValue', 'min', 'max'],
        emits: ['update:modelValue'],
        setup(props, { emit }) {
            const localValue = ref(Number(props.modelValue) || 0);

            watch(() => props.modelValue, (nextValue) => {
                localValue.value = Number(nextValue) || 0;
            });

            const emitValue = (nextValue) => {
                const normalized = Number(nextValue) || 0;
                emit('update:modelValue', normalized);
            };

            const onRangeInput = (event) => {
                const nextValue = Number(event.target.value) || 0;
                localValue.value = nextValue;
                emitValue(nextValue);
            };

            const onNumberInput = (event) => {
                const nextValue = Number(event.target.value) || 0;
                localValue.value = nextValue;
                emitValue(nextValue);
            };

            return {
                localValue,
                onRangeInput,
                onNumberInput
            };
        },
        template: `
            <div style="display: flex; gap: 5px; align-items: center; margin-top: 5px;">
                <input type="range" :min="min" :max="max" 
                       :value="localValue" @input="onRangeInput" 
                       style="flex: 1; min-width: 0;">
                <input type="number" 
                       :value="localValue" @input="onNumberInput" 
                       class="form-control" style="width: 50px; padding: 2px 4px;" @keyup.enter="$event.target.blur()">
            </div>
        `
    });

    // =========================================
    // 组件 3: 工艺层级列表元素组件
    // 提供给左侧侧边栏使用的图层列表项，包含可见性切换、删除操作、拖拽与高亮事件透传
    // =========================================
    app.component('layer-list-item', {
        props: ['step', 'index', 'isActive'],
        emits: ['toggle-visibility', 'delete-step', 'click', 'mouseover', 'mouseout', 'dragstart', 'drop'],
        template: `
            <div class="layer-item" :class="{ active: isActive }"
                 @click="$emit('click', $event)"
                 @mouseover="$emit('mouseover', $event)"
                 @mouseout="$emit('mouseout', $event)"
                 @dragstart="$emit('dragstart', $event)"
                 @drop="$emit('drop', $event)">
                <div style="display: flex; align-items: stretch; gap: 8px;">
                    <span style="color: #e1e1e1; font-size: 14px; width: 14px; text-align: right; flex-shrink: 0; display: flex; align-items: center; justify-content: flex-end;">{{ index }}</span>
                    <div :style="{ width: '12px', flexShrink: 0, background: (step.type === 'etch' || step.type === 'cmp') ? '#ffffff' : step.color, borderRadius: '2px', border: '1px solid #555' }"></div>
                    <div style="display: flex; flex-direction: column; justify-content: center; min-width: 0; padding: 2px 0;">
                        <span style="font-size: 15px; line-height: 1.2;">{{ step.name }}</span>
                        <span style="font-size: 11px; color: #999; line-height: 1.2; margin-top: 4px;">
                            {{ index === 0 ? '厚度' : (step.type === 'cmp' ? '抛光' : (step.type === 'etch' ? '深度' : '厚度')) }}: {{ step.thickness }}
                            <template v-if="step.type !== 'cmp' && index !== 0">&nbsp;|&nbsp;倾角: {{ step.angle }}°</template>
                        </span>
                    </div>
                </div>
                
                <div style="display: flex; gap: 8px;">
                    <span class="layer-visibility" @click.stop="$emit('toggle-visibility')" :title="step.visible ? '隐藏当前及之后工艺' : '取消隐藏'">
                        {{ step.visible ? '👁️' : '🚫' }}
                    </span>
                    <span @click.stop="$emit('delete-step')" style="color: #ff4757; font-size: 14px; cursor: pointer;" title="删除此步工艺">❌</span>
                </div>
            </div>
        `
    });

    // =========================================
    // 组件 4: 流程图子图卡片
    // 负责单张流程图卡片的头部、子图绘制区域与文字编辑交互
    // =========================================
    app.component('flow-diagram-card', {
        props: [
            'card',
            'flowDiagramSettings',
            'editingFlowDiagramStepId',
            'flowDiagramDraftCaption',
            'captionAnchor',
            'captionX',
            'captionPreview'
        ],
        emits: [
            'toggle-hidden',
            'start-edit',
            'update:draft-caption',
            'caption-keydown',
            'commit-caption'
        ],
        computed: {
            cardChrome() {
                return ['full', 'minimal', 'none'].includes(this.flowDiagramSettings.cardChrome)
                    ? this.flowDiagramSettings.cardChrome
                    : 'full';
            },
            isFullChrome() {
                return this.cardChrome === 'full';
            },
            isMinimalChrome() {
                return this.cardChrome === 'minimal';
            },
            showCardBorder() {
                return this.cardChrome === 'full' || this.cardChrome === 'minimal';
            },
            cardContainerStyle() {
                const border = this.cardChrome === 'full'
                    ? '1px solid #d1d5db'
                    : (this.cardChrome === 'minimal' ? '1px solid rgba(148, 163, 184, 0.45)' : '1px solid transparent');
                const boxShadow = this.cardChrome === 'full'
                    ? '0 6px 20px rgba(0,0,0,0.05)'
                    : 'none';
                return {
                    position: 'relative',
                    border,
                    borderRadius: '0',
                    background: '#fff',
                    overflow: 'hidden',
                    boxShadow
                };
            },
            captionGap() {
                const gap = Number(this.flowDiagramSettings.captionGap);
                if (!Number.isFinite(gap)) return 12;
                return Math.min(80, Math.max(-20, gap));
            },
            captionAreaHeight() {
                return Math.max(22, 36 + this.captionGap);
            },
            captionTextY() {
                return Math.max(8, this.captionGap + 18);
            },
            captionEditTop() {
                return Math.max(2, this.captionGap + 2);
            },
            captionBorderStyle() {
                return this.isFullChrome ? '1px solid #ececec' : 'none';
            }
        },
        template: `
            <div :style="cardContainerStyle" class="flow-diagram-card">
                <div v-if="isFullChrome" style="display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 10px 12px; border-bottom: 1px solid #ececec; background: #fafafa;">
                    <div style="font-size: 12px; color: #666;">
                        Step {{ card.index }}
                    </div>
                    <button class="btn btn-small" style="margin: 0; background: #fff; color: #444; border: 1px solid #cfd6de;" @click="$emit('toggle-hidden', card.stepId)">
                        隐藏
                    </button>
                </div>
                <button
                    v-else
                    class="btn btn-small flow-card-hover-action"
                    :style="{ margin: 0, position: 'absolute', top: '8px', right: '8px', zIndex: 3, background: 'rgba(255,255,255,0.92)', color: '#333', border: '1px solid #cfd6de', opacity: 0 }"
                    @click="$emit('toggle-hidden', card.stepId)"
                >
                    隐藏
                </button>

                <div style="padding: 0;">
                    <svg xmlns="http://www.w3.org/2000/svg" :viewBox="card.viewBox" preserveAspectRatio="none" width="100%" style="display: block; aspect-ratio: 1 / 0.72; background: #ffffff; border-radius: 0;">
                        <g>
                            <path v-for="path in card.paths" :key="path.id" :d="path.d" :fill="path.fill"></path>
                        </g>
                    </svg>
                </div>

                <div v-if="flowDiagramSettings.showCaption" :style="{ position: 'relative', borderTop: captionBorderStyle, background: '#fff' }">
                    <svg xmlns="http://www.w3.org/2000/svg" width="100%" :height="captionAreaHeight" :viewBox="'0 0 300 ' + captionAreaHeight" style="display: block;">
                        <text :x="captionX" :y="captionTextY" :text-anchor="captionAnchor" :fill="flowDiagramSettings.fontColor" :font-family="flowDiagramSettings.fontFamily" :font-size="flowDiagramSettings.fontSize">
                            {{ captionPreview }}
                        </text>
                    </svg>
                    <div v-if="editingFlowDiagramStepId !== card.stepId" style="position: absolute; inset: 0; display: flex; align-items: stretch;">
                        <button style="position: absolute; inset: 0; border: none; background: transparent; cursor: pointer;" @dblclick.stop="$emit('start-edit', card.stepId)" @click.stop title="双击编辑流程图文字"></button>
                        <button class="btn btn-small flow-card-hover-action" :style="{ position: 'absolute', right: '10px', top: captionEditTop + 'px', margin: 0, background: 'rgba(255,255,255,0.9)', color: '#333', border: '1px solid #d5dbe3', opacity: isFullChrome ? 1 : 0 }" @click.stop="$emit('start-edit', card.stepId)">修改</button>
                    </div>
                    <div v-else style="position: absolute; inset: 0; padding: 10px;">
                        <input
                            :data-flow-caption-input="card.stepId"
                            :value="flowDiagramDraftCaption"
                            :style="{ width: '100%', background: '#f8fafc', border: '1px solid #cbd5e1', color: '#111827', padding: '8px 10px', borderRadius: '4px', boxSizing: 'border-box', fontFamily: flowDiagramSettings.fontFamily, fontSize: flowDiagramSettings.fontSize + 'px' }"
                            @input="$emit('update:draft-caption', $event.target.value)"
                            @keydown="$emit('caption-keydown', $event)"
                            @blur="$emit('commit-caption')"
                        >
                    </div>
                </div>
            </div>
        `
    });

    // =========================================
    // 组件 5: 流程图画板容器
    // 负责流程图头部、状态提示、隐藏步骤列表与子图网格容器
    // =========================================
    app.component('flow-diagram-board', {
        props: [
            'boardStyle',
            'gridStyle',
            'summaryText',
            'cards',
            'hiddenSteps',
            'settings',
            'isGenerating',
            'isDirty',
            'generationError'
        ],
        emits: ['refresh', 'show-step'],
        template: `
            <div :style="boardStyle">
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; flex-wrap: wrap;">
                    <div>
                        <h3 style="margin: 0; color: #222;">流程图视图</h3>
                        <p style="margin: 6px 0 0; color: #666; font-size: 13px;">
                            当前状态：{{ summaryText }}，可见 {{ cards.length }} 张，隐藏 {{ hiddenSteps.length }} 张
                        </p>
                    </div>
                    <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                        <span style="font-size: 12px; color: #666;">每行 {{ settings.itemsPerRow }} 张</span>
                        <span style="font-size: 12px; color: #666;">文字 {{ settings.showCaption ? '显示' : '隐藏' }}</span>
                        <span style="font-size: 12px; color: #666;">质量 {{ settings.quality }}</span>
                        <button class="btn btn-small" style="margin: 0;" :disabled="isGenerating" @click="$emit('refresh')">
                            {{ isGenerating ? '生成中...' : '刷新流程图' }}
                        </button>
                    </div>
                </div>

                <div v-if="generationError" style="margin-bottom: 16px; padding: 12px 14px; border-radius: 8px; background: #fff3f3; border: 1px solid #efb8b8; color: #9b2c2c;">
                    {{ generationError }}
                </div>

                <div v-if="isDirty && !isGenerating" style="margin-bottom: 16px; padding: 12px 14px; border-radius: 8px; background: #fff8e6; border: 1px solid #ecd6a1; color: #8a6116;">
                    流程图结果尚未刷新。当前的步骤几何、质量档位或变量已经变化，请点击“刷新流程图”重新生成。
                </div>

                <div v-if="hiddenSteps.length" style="margin-bottom: 16px; padding: 14px; border-radius: 10px; background: #ffffff; border: 1px solid #e6e6e6;">
                    <div style="font-size: 13px; color: #666; margin-bottom: 10px;">已隐藏步骤</div>
                    <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                        <button v-for="item in hiddenSteps" :key="'flow-hidden-' + item.step.id" class="btn btn-small" style="margin: 0; background: #fff; color: #333; border: 1px solid #c9d0d8;" @click="$emit('show-step', item.step.id)">
                            恢复 {{ item.index }}. {{ item.step.name }}
                        </button>
                    </div>
                </div>

                <div v-if="!cards.length && !isGenerating" style="border: 1px dashed #bbb; border-radius: 10px; padding: 24px; background: #fff; color: #666; text-align: center;">
                    当前没有可展示的流程图子图。你可以点击“刷新流程图”重新生成，或者恢复被隐藏的步骤。
                </div>

                <div v-else :style="gridStyle">
                    <slot></slot>
                </div>
            </div>
        `
    });
}

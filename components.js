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
        template: `
            <div style="display: flex; gap: 5px; align-items: center; margin-top: 5px;">
                <input type="range" :min="min" :max="max" 
                       :value="modelValue" @input="$emit('update:modelValue', Number($event.target.value))" 
                       style="flex: 1; min-width: 0;">
                <input type="number" 
                       :value="modelValue" @input="$emit('update:modelValue', Number($event.target.value))" 
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
}

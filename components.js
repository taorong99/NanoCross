// components.js - 存放公共的自定义组件，提供给App实例挂载时使用

function registerComponents(app) {
    const { ref, watch } = Vue;

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
                <label style="font-size: 10px; color: #888;">{{ label }}</label>
                <div style="display: flex; gap: 2px; width: 100%;">
                    <select v-model="selectedType" @change="onTypeChange" class="form-control" style="font-size: 11px; padding: 0px 2px; height: 22px; flex: 1; min-width: 0;">
                        <option value="custom">自定义</option>
                        <option v-for="v in variables" :key="v.name" :value="v.name">{{ v.name }}</option>
                    </select>
                    <input v-if="selectedType === 'custom'" type="number" step="1" v-model.number="customValue" 
                        @input="onInput" @wheel="onWheel" @keyup.enter="$event.target.blur()" class="form-control" style="font-size: 11px; flex: 1; min-width: 0; height: 22px; padding: 2px;">
                </div>
            </div>
        `
    });
}

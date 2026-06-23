<template>
  <div class="instant-icon">
    <div v-if="detailedView">
      <span class="amount">{{ icon.price.amount }}x </span>
      <img :src="icon?.currencyIconUrl" class="icon-img" />
      <span class="uncertainty">{{ Array.from({ length: icon.price.uncertainty }, () => "?").join("") }}</span>
    </div>
    <div v-if="!detailedView">
      <img :src="icon?.generalIconUrl" class="general-img"/>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, PropType, computed } from "vue";
import type { IconModel } from "@/analyzer/display/icon-model";

export default defineComponent({
  props: {
    icon: {
      type: Object as PropType<IconModel>,
      required: true,
    },
    detailed: {
      type: Boolean,
      default: false,
    },
  },
  setup(props) {
    const detailedView = computed(() => props.detailed);
    return { detailedView };
  },
});
</script>

<style scoped>
.instant-icon {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: rgba(0,0,0,0);
  color: white;
  padding: 4px 6px;
  border-radius: 6px;
  font-size: 30px;
}
.icon-img {
  width: 50px;
  height: 50px;
  margin: -10px;
  object-fit: contain;
  display: inline-block;
}
.general-img {
  width: 80px;
  height: 80px;
  object-fit: contain;
  display: inline-block;
}
.amount {
  white-space: nowrap;
}
.uncertainty {
  font-family: monospace;
}
</style>

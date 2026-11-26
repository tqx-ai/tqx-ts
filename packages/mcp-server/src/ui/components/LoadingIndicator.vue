<script setup lang="ts">
withDefaults(defineProps<{ label?: string }>(), { label: 'Loading' })

const circleA =
  'M 12 8 C 14.21 8 16 9.79 16 12 C 16 14.21 14.21 16 12 16 C 9.79 16 8 14.21 8 12 C 8 9.79 9.79 8 12 8 Z'
const infinity =
  'M 12 12 C 14 8.5 19 8.5 19 12 C 19 15.5 14 15.5 12 12 C 10 8.5 5 8.5 5 12 C 5 15.5 10 15.5 12 12 Z'
const circleB =
  'M 12 16 C 14.21 16 16 14.21 16 12 C 16 9.79 14.21 8 12 8 C 9.79 8 8 9.79 8 12 C 8 14.21 9.79 16 12 16 Z'
</script>

<template>
  <div class="loading-indicator" role="status" :aria-label="label">
    <svg
      class="loading-icon"
      viewBox="4 7 16 10"
      width="30"
      height="30"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path class="loading-static" :d="infinity" />
      <path class="loading-animated" :d="circleA">
        <animate
          attributeName="d"
          :values="`${circleA};${infinity};${circleB};${infinity};${circleA}`"
          dur="5s"
          repeatCount="indefinite"
          calcMode="spline"
          keyTimes="0;0.25;0.5;0.75;1"
          keySplines="0.42 0 0.58 1;0.42 0 0.58 1;0.42 0 0.58 1;0.42 0 0.58 1"
        />
      </path>
    </svg>
    <span class="loading-text" aria-hidden="true">Loading</span>
    <span
      v-for="i in 3"
      :key="i"
      class="loading-dot"
      :style="{ animationDelay: `${i * 0.2}s` }"
      aria-hidden="true"
      >.</span
    >
  </div>
</template>

<style scoped>
.loading-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--muted, rgba(255, 255, 255, 0.65));
  font-size: 12px;
  line-height: 20px;
  white-space: nowrap;
}
.loading-icon {
  flex: 0 0 30px;
  width: 30px;
  height: 30px;
  margin-right: 8px;
}
.loading-text {
  letter-spacing: 1.5px;
}
.loading-dot {
  animation: loading-wave 1s infinite;
  opacity: 0.6;
  padding-top: 4px;
}
.loading-static {
  display: none;
}
@keyframes loading-wave {
  0%,
  80%,
  100% {
    opacity: 0.6;
    transform: translateY(0);
  }
  40% {
    opacity: 1;
    transform: translateY(-3px);
  }
}
@media (prefers-reduced-motion: reduce) {
  .loading-static {
    display: block;
  }
  .loading-animated {
    display: none;
  }
  .loading-dot {
    animation: none;
  }
}
</style>

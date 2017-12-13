import rpi_babel from 'rollup-plugin-babel'
import rpi_replace from 'rollup-plugin-replace'

const sourcemap = 'inline'

const external = ['crypto']

const plugins = [jsy_plugin()]
const replace_prod = {'process.env.NODE_ENV': "'production'"}
const plugins_prod = plugins.concat([rpi_replace({values: replace_prod})])

export default [
	{ input: 'code/index.jsy',
		output: [
      { file: `dist/index.js`, format: 'cjs' },
      { file: `dist/index.mjs`, format: 'es' },
    ],
    sourcemap, external, plugins },

	{ input: 'code/index.nodejs.jsy',
		output: [
      { file: `dist/nodejs.js`, format: 'cjs' },
      { file: `dist/nodejs.mjs`, format: 'es' },
    ],
    sourcemap, external, plugins: plugins_prod },

	{ input: 'code/index.browser.jsy',
    name: 'msg-fabric-sink',
		output: [
      { file: `dist/browser.js`, format: 'cjs' },
      { file: `dist/browser.mjs`, format: 'es' },
      { file: `dist/browser.umd.js`, format: 'umd' },
    ],
    sourcemap, external:[], plugins: plugins_prod },

	{ input: 'code/ep_kinds/index.jsy',
		output: { file: `dist/ep_kinds.mjs`, format: 'es' },
    sourcemap, external, plugins },

]




function jsy_plugin() {
  const jsy_preset = [ 'jsy/lean', { no_stage_3: true, modules: false } ]
  return rpi_babel({
    exclude: 'node_modules/**',
    presets: [ jsy_preset ],
    plugins: [],
    babelrc: false }) }

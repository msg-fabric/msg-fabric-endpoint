import pkg from './package.json'
import {minify} from 'uglify-es'
import rpi_jsy from 'rollup-plugin-jsy-babel'
import rpi_resolve from 'rollup-plugin-node-resolve'
import rpi_uglify from 'rollup-plugin-uglify'

const sourcemap = 'inline'
const plugins = [rpi_jsy()]
const test_plugins = plugins.concat([ rpi_resolve({ module: true }) ])

const ugly = { warnings: true, output: {comments: false, max_line_len: 256}}
const prod_plugins = plugins.concat([ rpi_uglify(ugly, minify) ])

const external = []

export default [
	{ input: 'code/index.jsy',
		output: [
      { file: pkg.module, format: 'es', sourcemap },
      { file: pkg.main, format: 'cjs', sourcemap, exports: 'named' },
    ],
    external, plugins },

  { input: 'code/index.default.jsy',
    output: { file: 'umd/msg-fabric-endpoint.js', format: 'umd', name: 'msg-fabric-endpoint', sourcemap },
    external:[], plugins },

	prod_plugins &&
    { input: 'code/index.default.jsy',
      output: { file: pkg.browser, format: 'umd', name: 'msg-fabric-endpoint' },
      external:[], plugins: prod_plugins },

  { input: 'test/unit/index.browser.js',
    output: {
      file: 'test/_unittest.iife.js',
      globals: {'msg-fabric-core': 'msg-fabric-core'},
      format: 'iife', sourcemap },
    external: [], plugins: test_plugins },
].filter(e=>e)

module.exports = function(grunt) {
  grunt.initConfig({
    /*
     * warpwallet-dismantled v1.0.1
     * https://github.com/davidapple/warpwallet-dismantled
     * Use the default grunt task to recompile warpwallet js and verify the authenticity of the code.
     */
    concat: {
      options: {
        separator: ';',
      },
      dist: {
        src: [
          'bower_components/warpwallet/src/js/deps.js',
        ],
        dest: 'js/warpwallet.js'
      },
    },
    uglify: {
      options: {
        mangle: false
      },
      target: {
        files: {
          'js/warpwallet.min.js': 'js/warpwallet.js',
        }
      }
    }
  });
  grunt.loadNpmTasks('grunt-contrib-concat');
  grunt.loadNpmTasks('grunt-contrib-uglify');
  grunt.registerTask('default', ['concat', 'uglify']);
};
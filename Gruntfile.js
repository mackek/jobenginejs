/*global module:false*/
module.exports = function(grunt) {

  // Project configuration.
  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),
    concat: {
      options: {
      banner: '/*! <%= pkg.title || pkg.name %> - v<%= pkg.version %> - ' +
        '<%= grunt.template.today("yyyy-mm-dd") %>\n' +
        '<%= pkg.homepage ? "* " + pkg.homepage + "\\n" : "" %>' +
        '* Copyright (c) <%= grunt.template.today("yyyy") %> Kyle Mackenzie;' +
        ' Licensed MIT */' + "\n\n",
        stripBanners: true
      },
      dist: {
        src: ['lib/<%= pkg.name %>.js'],
        dest: 'dist/<%= pkg.name %>.js'
      }
    },
    watch: {
      files: 'lib/*.coffee',
      tasks: ['coffee', 'concat']
    },
    coffee: {
      compile: {
        expand: true, 
        flatten: true,
        cwd: 'lib/',
        src: ['*.coffee'],
        dest: 'lib/',
        ext: '.js',
        options: {
          bare: true
        }
      }
    }
  });
  grunt.loadNpmTasks('grunt-contrib-coffee');
  grunt.loadNpmTasks('grunt-contrib-watch');
  grunt.loadNpmTasks('grunt-contrib-concat');

  // Default task.
  grunt.registerTask('default', ['coffee', 'concat']);

};

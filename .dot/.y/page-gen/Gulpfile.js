'use strict';

const gulp = require('gulp');
const { watch, src, dest } = gulp

const output = "../../../build/"
const sources =
{
  jsx: [
    "../../../pages/*/*.jsx",
    "../../../pages/*.jsx"
  ],
  img: [
    "../../../static/img/**"
  ],
  css: [
    "../../../static/*.css"
  ]
}

function css() {
  const postcss = require('gulp-postcss')
  return src(sources.css[0])
    .pipe(postcss([require('tailwindcss'),  require('autoprefixer')]))
    .pipe(require('gulp-clean-css')({ compatibility: 'ie8' }))
    .pipe(dest(`${output}`))
}

function img() {
  const image = require('gulp-image')

  return src(sources.img[0])
    .pipe(image())
    .pipe(dest(`${output}/img`))
}

gulp.task('build', function () {
  img();
  css();
})

gulp.task('default', function () {
  img();
  css();

  sources.jsx.forEach(function (source) {
    watch(source, () => {
      css()
    })
  });
})
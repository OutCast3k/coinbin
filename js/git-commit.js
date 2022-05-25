var git_commit = '';
var git_commit_sub = git_commit.substring(0, 8);

$(document).ready(function(){
  $('#git-commit').text(`${git_commit_sub}`);
  $('#git-commit-footer').text(`${git_commit_sub}`);
  $('#git-commit-href').attr('href', `https://github.com/ayanamitech/coinbin/commit/${git_commit}`);
  $('#git-commit-href-footer').attr('href', `https://github.com/ayanamitech/coinbin/commit/${git_commit}`);
});

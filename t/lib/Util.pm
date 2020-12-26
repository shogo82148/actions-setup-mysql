package Util;

use strict;
use warnings;
use utf8;
use IPC::Open3;

use Exporter 'import';
our @EXPORT_OK = qw(run detect_version);

use Carp qw/croak/;

sub run {
    my @args = @_;
    my $pid = open3(my $in, my $out, 0, @args);
    close($in);
    my $result = do { local $/; <$out> };
    waitpid($pid, 0);
    if ($? != 0) {
        my $code = $? >> 8;
        my $cmd = join ' ', @args;
        croak "`$cmd` exit code: $code, message: $result";
    }
    return $result;
}

sub detect_version {
    my ($user, $password) = @_;
    local $ENV{MYSQL_PWD} = $password;
    my $version = run('mysql', '--host=127.0.0.1', "--user=$user", '-e', 'SELECT VERSION()');
    if ($version =~ /([0-9]*)-MariaDB/i) {
        return $1, 'mariadb';
    }
    if ($version =~ /^([0-9.]*)$/mi) {
        return $1, 'mysql';
    }
    croak "unknown distribution: $version";
}

"NoSQL + SQL = MySQL"

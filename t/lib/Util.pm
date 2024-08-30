package Util;

use v5.40;
use utf8;
use IPC::Open3;

use Exporter 'import';
our @EXPORT_OK = qw(run detect_version);

use Carp qw/croak/;

sub run(@args) {
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

sub detect_version($user, $password) {
    local $ENV{MYSQL_PWD} = $password;
    my $version = _select_version($user);
    if ($version =~ /([0-9.]*)-MariaDB/i) {
        return $1, 'mariadb';
    }
    if ($version =~ /^\s*([0-9.]*)\s*$/mi) {
        return $1, 'mysql';
    }
    croak "unknown distribution: $version";
}

sub _select_version($user) {
    try {
        # MariaDB 11.4 and later require `--skip-ssl` option
        my $version = run('mariadb', '--host=127.0.0.1', "--user=$user", '--skip-ssl', '-e', 'SELECT VERSION()');
        return $version;
    } catch($e) {
        say STDERR "Warn: $e";
    }

    try {
        my $version = run('mysql', '--host=127.0.0.1', "--user=$user", '-e', 'SELECT VERSION()');
        return $version;
    } catch($e) {
        say STDERR "Warn: $e";
    }
}

use strict;
use warnings;
use utf8;
use Test::More;
use FindBin;
use lib "$FindBin::Bin/lib";
use Util qw(run detect_version);

plan skip_all => 'expected version is not set' unless $ENV{MYSQL_VERSION};

my $want_dist = 'mysql';
my $want_ver = $ENV{MYSQL_VERSION};
if ($want_ver =~ /^mariadb-([0-9.])$/i) {
    $want_ver = $1;
    $want_dist = 'mariadb';
}

$ENV{MYSQL_PWD} = 'very-very-secret';
diag "server version: " . run('mysql', '--host=127.0.0.1', '--user=root', '-e', 'SELECT VERSION()');

my ($got_ver, $got_dist) = detect_version('root', 'very-very-secret');
like $got_ver, qr/^\Q$want_ver\E\.[0-9]+$/, 'the server version';
is $got_dist, $want_dist, 'the server distribution';

my $client = run('mysql', '--no-defaults', '--version');
diag "client version: $client";
if ($want_dist eq 'mysql') {
    like $client, qr/Ver\s+\Q$want_ver\E\.[0-9]+\s/, 'the client version';
} elsif ($want_dist eq 'mariadb') {
    like $client, qr/Distrib\s+\Q$want_ver\E\.[0-9]+-MariaDB/, 'the client version';
}

done_testing;

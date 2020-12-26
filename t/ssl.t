use strict;
use warnings;
use utf8;
use Test::More;
use FindBin;
use lib "$FindBin::Bin/lib";
use Util qw(run);

$ENV{MYSQL_PWD} = 'very-very-secret';
my @command = ('mysql', '--host=127.0.0.1', '--user=root', '--ssl-mode=REQUIRED', '-e', "SHOW SESSION STATUS LIKE 'Ssl_cipher'");
diag run(@command);

done_testing;

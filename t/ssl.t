use strict;
use warnings;
use utf8;
use Test::More;
use FindBin;
use lib "$FindBin::Bin/lib";
use Util qw(run);

$ENV{MYSQL_PWD} = 'very-very-secret';
my @command = ('mysql', '--host=127.0.0.1', '--user=root', '--ssl-mode=REQUIRED', '-e', "SHOW SESSION STATUS LIKE 'Ssl_cipher'");
my $cipher = run(@command);
like $cipher, qr/^Ssl_cipher\s+\S+$/m, 'Ssl_cipher is set';

done_testing;
